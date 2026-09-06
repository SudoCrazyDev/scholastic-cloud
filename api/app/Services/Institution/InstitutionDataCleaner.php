<?php

namespace App\Services\Institution;

use App\Models\InstitutionCleanupLog;
use App\Support\InstitutionCleanupGroups;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Counts and deletes one institution's records, keeping its people.
 *
 * The counterpart of FinanceDataCleaner, one level up: that one empties a year
 * of money, this one empties a whole school of everything except the students
 * and staff on its roster. Same two entry points sharing one set of rules, so
 * the screen can never promise something the delete then does differently:
 *
 *  - {@see preview()} — what would go, and what stands in the way.
 *  - {@see clear()} — do it, in a transaction, and write the audit entry.
 *
 * Everything runs on the query builder rather than Eloquent, and for a stronger
 * reason than convenience. Models here bring observers that recalculate running
 * grades, events that push chat rosters to the Cloudflare Worker, and
 * soft-delete scopes that would hide exactly the rows a clean-up must take — a
 * waived late fee, a trashed running grade, a deleted chat message. Deleting
 * 40,000 rows through models would also fire 40,000 sets of them. The intent
 * here is "these rows are gone", which is a statement about tables.
 *
 * ## What keeps this from being a cross-tenant accident
 *
 * Every query is narrowed by {@see scopedQuery()}, which never falls back to an
 * unscoped table. A table with no `institution_id` is reached through a parent
 * that has one, recursively, so a student enrolled at two schools keeps the
 * other school's grades, attendance and money when this one is emptied. The
 * single exception is `core_value_markings`, which the schema gives no route to
 * an institution at all; it is scoped through enrolment and said so on screen.
 */
class InstitutionDataCleaner
{
    /**
     * Columns holding an R2 object key, by table.
     *
     * The uploads a clean-up orphans if it does not sweep them. Student
     * documents and profile pictures are deliberately absent: those belong to
     * the student, who survives the clean-up with their files.
     *
     * @var array<string, string>
     */
    private const FILE_COLUMNS = [
        'payment_receipt_submissions' => 'file_path',
        'announcement_attachments' => 'file_path',
        'disbursement_receipts' => 'path',
    ];

    public function __construct(
        private readonly string $institutionId,
    ) {
    }

    /**
     * What a clean-up of these groups would delete, and why it might be refused.
     *
     * @param  array<string>  $groups
     * @return array{
     *     groups: array<int, array{key: string, label: string, area: string, description: string, total: int, tables: array<string, int>}>,
     *     total: int,
     *     files: int,
     *     blockers: array<int, array<string, mixed>>,
     *     clearable: bool
     * }
     */
    public function preview(array $groups): array
    {
        $groups = $this->normalizeGroups($groups);

        $summaries = [];
        $total = 0;

        foreach ($groups as $group) {
            $definition = InstitutionCleanupGroups::all()[$group];
            $perTable = [];
            $groupTotal = 0;

            foreach ($definition['tables'] as $table) {
                $count = (int) $this->scopedQuery($table)->count();
                $perTable[$table] = $count;
                $groupTotal += $count;
            }

            $summaries[] = [
                'key' => $group,
                'label' => $definition['label'],
                'area' => $definition['area'],
                'description' => $definition['description'],
                'total' => $groupTotal,
                'tables' => $perTable,
            ];

            $total += $groupTotal;
        }

        $blockers = $this->blockers($groups);

        return [
            'groups' => $summaries,
            'total' => $total,
            'files' => count($this->filePaths($groups)),
            'blockers' => $blockers,
            'clearable' => empty($blockers),
        ];
    }

    /**
     * Delete the selected groups and record what went.
     *
     * @param  array<string>  $groups
     * @param  array{id: ?string, name: ?string, role: ?string}  $operator
     * @return array{
     *     log_id: ?string,
     *     groups: array<string>,
     *     deleted_counts: array<string, int>,
     *     total_deleted: int,
     *     files_deleted: int,
     *     files_failed: int
     * }
     *
     * @throws RuntimeException when a dependency guard refuses the run
     */
    public function clear(array $groups, array $operator): array
    {
        $groups = $this->normalizeGroups($groups);

        // Re-checked here, not just in the controller: the preview the operator
        // read may be minutes old, and a teacher moved onto a school-built role
        // since then is exactly the row the guard exists to protect.
        $blockers = $this->blockers($groups);
        if (! empty($blockers)) {
            throw new RuntimeException($blockers[0]['message']);
        }

        // Collected before the delete — once the rows are gone there is nothing
        // left to read an object key off. The objects themselves are removed
        // after the transaction commits, since an R2 delete cannot be rolled
        // back and a failed sweep must not undo a completed clean-up.
        $files = $this->filePaths($groups);

        $counts = [];
        $log = null;

        DB::transaction(function () use ($groups, $operator, &$counts, &$log) {
            foreach ($groups as $group) {
                foreach (InstitutionCleanupGroups::tables($group) as $table) {
                    $deleted = (int) $this->scopedQuery($table)->delete();
                    // A table belongs to one group only, but sum rather than
                    // assign so a future overlap cannot silently lose a tally.
                    $counts[$table] = ($counts[$table] ?? 0) + $deleted;
                }
            }

            $log = InstitutionCleanupLog::create([
                'institution_id' => $this->institutionId,
                'groups' => $groups,
                'deleted_counts' => $counts,
                'total_deleted' => array_sum($counts),
                // Filled in after the file sweep below; the row exists first so
                // a failed sweep still leaves an entry for the deletes.
                'files_deleted' => 0,
                'files_failed' => 0,
                'cleared_by' => $operator['id'] ?? null,
                'cleared_by_name' => $operator['name'] ?? null,
                'cleared_by_role' => $operator['role'] ?? null,
            ]);
        });

        [$filesDeleted, $filesFailed] = $this->deleteFiles($files);

        if ($log && ($filesDeleted || $filesFailed)) {
            $log->update([
                'files_deleted' => $filesDeleted,
                'files_failed' => $filesFailed,
            ]);
        }

        return [
            'log_id' => $log?->id,
            'groups' => $groups,
            'deleted_counts' => $counts,
            'total_deleted' => array_sum($counts),
            'files_deleted' => $filesDeleted,
            'files_failed' => $filesFailed,
        ];
    }

    /**
     * How many students and staff this institution keeps, for the confirmation.
     *
     * The screen states the promise as a number rather than a sentence, because
     * "students and staff are kept" is exactly the claim an operator about to
     * empty a live school wants evidence for. Counted the same way before and
     * after, so a run that broke the promise would be visible in the history.
     *
     * @return array{students: int, staff: int}
     */
    public function retainedPeople(): array
    {
        return [
            'students' => (int) DB::table('student_institutions')
                ->where('institution_id', $this->institutionId)
                ->distinct()
                ->count('student_id'),
            'staff' => (int) DB::table('user_institutions')
                ->where('institution_id', $this->institutionId)
                ->distinct()
                ->count('user_id'),
        ];
    }

    /**
     * Reasons this selection would leave a surviving row broken.
     *
     * Structurally the same guard FinanceDataCleaner runs, and for the same
     * reason — the database will not stop any of this, because every foreign key
     * involved is CASCADE or SET NULL. In practice it fires on one thing: school
     * -built roles that staff are still attached to. Deleting those succeeds and
     * silently strips every permission from the people the clean-up exists to
     * preserve.
     *
     * @param  array<string>  $groups
     * @return array<int, array<string, mixed>>
     */
    private function blockers(array $groups): array
    {
        $doomedTables = InstitutionCleanupGroups::tablesFor($groups);
        $blockers = [];

        foreach ($groups as $group) {
            foreach (InstitutionCleanupGroups::tables($group) as $table) {
                foreach (InstitutionCleanupGroups::dependentsOf($table) as $dependent) {
                    // A child that this run is deleting anyway cannot be
                    // stranded by it. `role_permissions` goes with its role.
                    if (in_array($dependent['table'], $doomedTables, true)) {
                        continue;
                    }

                    $survivors = (int) DB::table($dependent['table'])
                        ->whereNotNull($dependent['column'])
                        ->whereIn(
                            $dependent['column'],
                            $this->scopedQuery($table)->select("{$table}.id"),
                        )
                        ->count();

                    if ($survivors > 0) {
                        $blockers[] = [
                            'group' => $group,
                            'group_label' => InstitutionCleanupGroups::label($group),
                            'table' => $table,
                            'column' => $dependent['column'],
                            'blocking_table' => $dependent['table'],
                            'rule' => $dependent['rule'],
                            'count' => $survivors,
                            'message' => $this->blockerMessage($group, $dependent, $survivors),
                        ];
                    }
                }
            }
        }

        return $blockers;
    }

    /**
     * @param  array{table: string, column: string, rule: string, note: string}  $dependent
     */
    private function blockerMessage(string $group, array $dependent, int $count): string
    {
        $rows = $count === 1 ? '1 row' : number_format($count) . ' rows';

        return sprintf(
            '"%s" cannot be cleared: %s in %s still point at one, and %s. Move those people to a system role first, or leave this group unticked.',
            InstitutionCleanupGroups::label($group),
            $rows,
            str_replace('_', ' ', $dependent['table']),
            $dependent['note'],
        );
    }

    /**
     * A query narrowed to exactly the rows this run may delete from a table.
     *
     * Recursive by design. `student_assessment_answers` has no institution of
     * its own, nor does the attempt above it, nor the ECR item above that, nor
     * the ECR above that — the chain only reaches `institution_id` at
     * `subjects`, four hops up, and each hop is one nested `whereIn` here.
     */
    private function scopedQuery(string $table): Builder
    {
        $query = DB::table($table);

        $this->applyInstitutionScope($query, $table);

        foreach (InstitutionCleanupGroups::extraConditions()[$table] ?? [] as $column => $value) {
            $query->where("{$table}.{$column}", $value);
        }

        return $query;
    }

    /**
     * Confine a query to this institution, however the table is scoped.
     */
    private function applyInstitutionScope(Builder $query, string $table): void
    {
        $scope = InstitutionCleanupGroups::scoping()[$table] ?? null;

        if ($scope === null) {
            $query->where("{$table}.institution_id", $this->institutionId);

            return;
        }

        if ($scope['via'] === 'enrolled_student') {
            $query->whereIn(
                "{$table}.{$scope['foreign_key']}",
                DB::table('student_institutions')
                    ->where('institution_id', $this->institutionId)
                    ->select('student_id'),
            );

            return;
        }

        // via 'parent' — narrow the parent the same way, however deep that goes,
        // and match on the rows it leaves.
        $parent = $scope['parent'];
        $parentQuery = DB::table($parent)->select("{$parent}.id");
        $this->applyInstitutionScope($parentQuery, $parent);

        $query->whereIn("{$table}.{$scope['foreign_key']}", $parentQuery);
    }

    /**
     * R2 object keys for the uploads this run will delete.
     *
     * @param  array<string>  $groups
     * @return array<string>
     */
    private function filePaths(array $groups): array
    {
        $tables = InstitutionCleanupGroups::tablesFor($groups);
        $paths = [];

        foreach (self::FILE_COLUMNS as $table => $column) {
            if (! in_array($table, $tables, true)) {
                continue;
            }

            foreach ($this->scopedQuery($table)->whereNotNull($column)->pluck($column) as $path) {
                if (is_string($path) && $path !== '') {
                    $paths[$path] = true;
                }
            }
        }

        return array_keys($paths);
    }

    /**
     * Remove the stored uploads, after the rows are gone.
     *
     * Runs outside the transaction and never throws: the database is already
     * committed, and an object storage hiccup must not present a completed
     * clean-up as a failure. A file left behind is orphaned, not harmful, and
     * both counts go on the audit entry so the gap is visible rather than
     * assumed.
     *
     * @param  array<string>  $paths
     * @return array{0: int, 1: int}
     */
    private function deleteFiles(array $paths): array
    {
        if (empty($paths)) {
            return [0, 0];
        }

        $deleted = 0;
        $failed = 0;

        foreach ($paths as $path) {
            try {
                // The r2 disk is configured with 'throw' => false, so a missing
                // object reports false rather than raising.
                if (Storage::disk('r2')->delete($path)) {
                    $deleted++;
                } else {
                    $failed++;
                }
            } catch (\Throwable $e) {
                $failed++;
                Log::warning('Institution clean-up could not delete a file', [
                    'institution_id' => $this->institutionId,
                    'path' => $path,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return [$deleted, $failed];
    }

    /**
     * Valid group keys only, de-duplicated and back in catalog order.
     *
     * Catalog order is the delete order across groups, and it is not optional:
     * `structure` is what most other groups are scoped *through*, so a run that
     * deleted subjects before grades would leave the grades unreachable by the
     * query meant to take them. Whatever order the client sends, the run uses
     * this one.
     *
     * @param  array<string>  $groups
     * @return array<string>
     */
    private function normalizeGroups(array $groups): array
    {
        $requested = array_unique(array_filter(
            $groups,
            fn ($g) => is_string($g) && InstitutionCleanupGroups::exists($g),
        ));

        return array_values(array_filter(
            InstitutionCleanupGroups::keys(),
            fn (string $key) => in_array($key, $requested, true),
        ));
    }
}
