<?php

namespace App\Services\Finance;

use App\Models\FinanceDataClearLog;
use App\Support\FinanceDataGroups;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Counts and deletes a school's Finance data for one academic year.
 *
 * Two entry points, sharing one set of rules so the screen can never promise
 * something the delete then does differently:
 *
 *  - {@see preview()} — what would go, and what stands in the way.
 *  - {@see clear()} — do it, in a transaction, and write the audit entry.
 *
 * Everything runs on the query builder rather than Eloquent. Models bring
 * observers, soft-delete scopes and per-row events, none of which help when the
 * intent is "remove these rows"; a soft-deleted late fee in particular is
 * invisible to a model query and would survive a clear that claimed to have
 * taken it.
 *
 * Three areas are never touched, by construction rather than by filter: they
 * have no group in FinanceDataGroups. Payment plans, finance announcements and
 * disbursements are all left standing.
 */
class FinanceDataCleaner
{
    public function __construct(
        private readonly string $institutionId,
        private readonly string $academicYear,
    ) {
    }

    /**
     * What a clear of these groups would delete, and why it might be refused.
     *
     * @param  array<string>  $groups
     * @return array{
     *     academic_year: string,
     *     groups: array<int, array{key: string, label: string, scope: string, total: int, tables: array<string, int>}>,
     *     total: int,
     *     blockers: array<int, array{group: string, group_label: string, table: string, column: string, blocking_table: string, rule: string, count: int, message: string}>,
     *     clearable: bool
     * }
     */
    public function preview(array $groups): array
    {
        $groups = $this->normalizeGroups($groups);

        $summaries = [];
        $total = 0;

        foreach ($groups as $group) {
            $definition = FinanceDataGroups::all()[$group];
            $perTable = [];
            $groupTotal = 0;

            foreach ($definition['tables'] as $table) {
                $count = (int) $this->scopedQuery($table, $group)->count();
                $perTable[$table] = $count;
                $groupTotal += $count;
            }

            $summaries[] = [
                'key' => $group,
                'label' => $definition['label'],
                'description' => $definition['description'],
                'scope' => $definition['scope'],
                'total' => $groupTotal,
                'tables' => $perTable,
            ];

            $total += $groupTotal;
        }

        $blockers = $this->blockers($groups);

        return [
            'academic_year' => $this->academicYear,
            'groups' => $summaries,
            'total' => $total,
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
     *     log_id: string,
     *     academic_year: string,
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
        // saw may be minutes old, and a payment posted since then is exactly the
        // row a guard exists to protect.
        $blockers = $this->blockers($groups);
        if (! empty($blockers)) {
            throw new RuntimeException($blockers[0]['message']);
        }

        // Collected before the delete — once the rows are gone there is nothing
        // left to read a file path off. The objects themselves are removed after
        // the transaction commits, since an R2 delete cannot be rolled back.
        $receiptFiles = $this->receiptFilePaths($groups);

        $counts = [];
        $log = null;

        DB::transaction(function () use ($groups, $operator, &$counts, &$log) {
            foreach ($groups as $group) {
                foreach (FinanceDataGroups::tables($group) as $table) {
                    $deleted = (int) $this->scopedQuery($table, $group)->delete();
                    // A table can appear in one group only, but sum rather than
                    // assign so a future overlap cannot silently lose a tally.
                    $counts[$table] = ($counts[$table] ?? 0) + $deleted;
                }
            }

            $log = FinanceDataClearLog::create([
                'institution_id' => $this->institutionId,
                'academic_year' => $this->academicYear,
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

        [$filesDeleted, $filesFailed] = $this->deleteReceiptFiles($receiptFiles);

        if ($log && ($filesDeleted || $filesFailed)) {
            $log->update([
                'files_deleted' => $filesDeleted,
                'files_failed' => $filesFailed,
            ]);
        }

        return [
            'log_id' => $log?->id,
            'academic_year' => $this->academicYear,
            'groups' => $groups,
            'deleted_counts' => $counts,
            'total_deleted' => array_sum($counts),
            'files_deleted' => $filesDeleted,
            'files_failed' => $filesFailed,
        ];
    }

    /**
     * Reasons this selection would destroy data outside its own scope.
     *
     * Every foreign key into the Finance tables is CASCADE or SET NULL, so the
     * database will not stop any of this — it will succeed and quietly strand or
     * remove rows belonging to a year the operator did not select. Each blocker
     * is a count of rows that would **survive** the clear while pointing at
     * something it deleted.
     *
     * @param  array<string>  $groups
     * @return array<int, array<string, mixed>>
     */
    private function blockers(array $groups): array
    {
        $doomedTables = FinanceDataGroups::tablesFor($groups);
        $blockers = [];

        foreach ($groups as $group) {
            foreach (FinanceDataGroups::tables($group) as $table) {
                foreach (FinanceDataGroups::dependentsOf($table) as $dependent) {
                    $survivors = $this->countSurvivingReferences(
                        $table,
                        $group,
                        $dependent,
                        $doomedTables,
                    );

                    if ($survivors > 0) {
                        $blockers[] = [
                            'group' => $group,
                            'group_label' => FinanceDataGroups::label($group),
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
     * Rows in `$dependent` that this run leaves in place but would break.
     *
     * @param  array{table: string, column: string, rule: string, note: string}  $dependent
     * @param  array<string>  $doomedTables
     */
    private function countSurvivingReferences(
        string $parentTable,
        string $parentGroup,
        array $dependent,
        array $doomedTables,
    ): int {
        $childTable = $dependent['table'];

        $query = DB::table($childTable)
            ->whereNotNull($dependent['column'])
            // Only references into the rows this run actually deletes. A payment
            // pointing at a fee that is staying put is nobody's problem.
            ->whereIn(
                $dependent['column'],
                $this->scopedQuery($parentTable, $parentGroup)->select('id'),
            );

        $this->applyInstitutionScope($query, $childTable);

        if (in_array($childTable, $doomedTables, true)) {
            // The child is being cleared too, so only the part of it this run
            // leaves behind can be a survivor. A catalog child is emptied
            // outright, so nothing survives to be stranded.
            if (! FinanceDataGroups::isYearScoped($childTable)) {
                return 0;
            }

            // A year-scoped child keeps every other academic year, and those are
            // the rows at risk.
            $query->where('academic_year', '!=', $this->academicYear);
        }

        return (int) $query->count();
    }

    private function blockerMessage(string $group, array $dependent, int $count): string
    {
        $groupLabel = FinanceDataGroups::label($group);
        $rows = $count === 1 ? '1 row' : number_format($count) . ' rows';

        return sprintf(
            '"%s" cannot be cleared yet: %s in %s outside %s still reference it, and %s. Clear those first, or leave this group unticked.',
            $groupLabel,
            $rows,
            str_replace('_', ' ', $dependent['table']),
            $this->academicYear,
            $dependent['note'],
        );
    }

    /**
     * The group in this run that owns a table, if any.
     *
     * @param  array<string>  $groups
     */
    private function groupOwning(string $table, array $groups): ?string
    {
        foreach ($groups as $group) {
            if (in_array($table, FinanceDataGroups::tables($group), true)) {
                return $group;
            }
        }

        return null;
    }

    /**
     * A query narrowed to exactly the rows this run may delete from a table.
     *
     * Three narrowings, applied in order:
     *
     *  1. the institution — directly, or through the parent for a table that
     *     has no `institution_id` of its own;
     *  2. the academic year, for the tables that carry one;
     *  3. nothing else. A table in a catalog group is emptied for the
     *     institution, which is what the group promises on screen.
     */
    private function scopedQuery(string $table, string $group): Builder
    {
        $query = DB::table($table);

        $this->applyInstitutionScope($query, $table);

        if (FinanceDataGroups::isYearScoped($table)) {
            $query->where('academic_year', $this->academicYear);
        }

        return $query;
    }

    /**
     * Confine a query to this institution, however the table is scoped.
     */
    private function applyInstitutionScope(Builder $query, string $table): void
    {
        $throughParent = FinanceDataGroups::scopedThroughParent()[$table] ?? null;

        if ($throughParent === null) {
            $query->where("{$table}.institution_id", $this->institutionId);

            return;
        }

        // e.g. sibling_group_members -> sibling_groups.institution_id
        $query->whereIn(
            "{$table}.{$throughParent['foreign_key']}",
            DB::table($throughParent['parent'])
                ->where('institution_id', $this->institutionId)
                ->select('id'),
        );
    }

    /**
     * R2 object keys for the receipt uploads this run will delete.
     *
     * @param  array<string>  $groups
     * @return array<string>
     */
    private function receiptFilePaths(array $groups): array
    {
        $group = $this->groupOwning('payment_receipt_submissions', $groups);

        if ($group === null) {
            return [];
        }

        return $this->scopedQuery('payment_receipt_submissions', $group)
            ->whereNotNull('file_path')
            ->pluck('file_path')
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Remove the stored receipt images, after the rows are gone.
     *
     * Runs outside the transaction and never throws: the database is already
     * committed, and an object storage hiccup must not present a completed clear
     * as a failure. A file left behind is orphaned, not harmful, and the counts
     * go on the audit entry so the gap is visible.
     *
     * @param  array<string>  $paths
     * @return array{0: int, 1: int}
     */
    private function deleteReceiptFiles(array $paths): array
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
                Log::warning('Finance data clear could not delete a receipt file', [
                    'institution_id' => $this->institutionId,
                    'academic_year' => $this->academicYear,
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
     * Catalog order matters: it puts the year-scoped groups before the catalogs
     * they point at, so a run that clears both deletes the referencing rows
     * first and never trips its own guard.
     *
     * @param  array<string>  $groups
     * @return array<string>
     */
    private function normalizeGroups(array $groups): array
    {
        $requested = array_unique(array_filter($groups, fn ($g) => is_string($g) && FinanceDataGroups::exists($g)));

        return array_values(array_filter(
            FinanceDataGroups::keys(),
            fn (string $key) => in_array($key, $requested, true),
        ));
    }
}
