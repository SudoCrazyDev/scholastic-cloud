<?php

namespace App\Services\Matatag;

use App\Models\MatatagCurriculumVersion;
use App\Models\MatatagLearningArea;
use App\Support\MatatagTerms;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Loads one DepEd catalog file into the MATATAG curriculum tables.
 *
 * This is the only writer of the six global catalog tables. It is shipped two
 * ways — a data migration (so Grade 1 arrives everywhere on deploy) and
 * `php artisan matatag:load-catalog` (so Grades 2 and 3 can arrive without
 * one) — and both go through here, so there is one set of guards.
 *
 * ## It is idempotent, by natural key rather than by id
 *
 * Re-running a load must not double the catalog, and must not renumber it
 * either: the ids it writes are pinned by `matatag_competency_ratings.slot_id`
 * and by `matatag_section_curricula.curriculum_version_id`, so a
 * delete-and-reinsert would either fail or orphan a year of descriptors. Every
 * row is therefore matched on the key DepEd's own file implies:
 *
 *   version      code
 *   area         (version, key)
 *   domain       (area, term, code)
 *   competency   (area, path)            - 'T1.9.a'
 *   slot         (competency, term, macro_skill)
 *
 * A row in the file that is not in the database is created, one that differs
 * is updated in place, and one in the database that the file no longer
 * mentions is deleted. A load that changes nothing reports changing nothing.
 *
 * ## Three refusals, each guarding a different disaster
 *
 * - **A locked version is never rewritten**, and `--force` cannot override it.
 *   `locked_at` is stamped the first time a teacher records a descriptor, so
 *   rewriting it would change what a competency said *after* a child was
 *   marked against it. A correction to a catalog in use is a new version with
 *   a new code, never an edit. This is the module's central promise.
 * - **A version some section is already pinned to is not changed without
 *   `--force`.** Nobody has marked anything yet or it would be locked, but a
 *   section is mid-year against it, and an operator should have to say so out
 *   loud.
 * - **The file's own counts must match what was inserted.** The file states
 *   how many competencies and slots it believes it holds, per area and in
 *   total, and the load rolls back if the database disagrees. A re-extraction
 *   that silently lost a macro-skill fill — the exact failure the extractor is
 *   most prone to, since a slot exists *only* by virtue of a cell colour —
 *   fails here rather than shipping a short catalog nobody notices until a
 *   teacher cannot find a competency.
 */
class CatalogLoader
{
    /** @var array<string, array{created: int, updated: int, deleted: int}> */
    private array $changes = [];

    /**
     * Decode a catalog file, without touching the database.
     *
     * @throws CatalogLoadException
     */
    public static function decodeFile(string $path): array
    {
        if (! is_file($path) || ! is_readable($path)) {
            throw new CatalogLoadException("Catalog file not found or unreadable: {$path}");
        }

        $payload = json_decode((string) file_get_contents($path), true);

        if (! is_array($payload)) {
            throw new CatalogLoadException(
                "Catalog file is not valid JSON: {$path} (".json_last_error_msg().')'
            );
        }

        return $payload;
    }

    /**
     * @throws CatalogLoadException
     */
    public function loadFile(string $path, bool $makeDefault = false, bool $force = false): CatalogLoadResult
    {
        return $this->load(self::decodeFile($path), $makeDefault, $force);
    }

    /**
     * @throws CatalogLoadException
     */
    public function load(array $payload, bool $makeDefault = false, bool $force = false): CatalogLoadResult
    {
        $this->validate($payload);
        $this->changes = [];

        try {
            return DB::transaction(fn () => $this->write($payload, $makeDefault, $force));
        } catch (CatalogLoadException $e) {
            throw $e;
        } catch (Throwable $e) {
            // Most likely a foreign-key restriction: something in this catalog
            // is referenced by a descriptor or a section pin. Say so, rather
            // than surfacing a raw SQLSTATE to whoever is running a DepEd
            // update.
            throw new CatalogLoadException(
                'Catalog load failed and was rolled back: '.$e->getMessage(),
                0,
                $e
            );
        }
    }

    private function write(array $payload, bool $makeDefault, bool $force): CatalogLoadResult
    {
        $version = $this->syncVersion($payload['version']);

        if ($version->isLocked()) {
            throw new CatalogLoadException(
                "Curriculum version '{$version->code}' is locked: descriptors have already been ".
                'recorded against it, so its competencies cannot change. Publish the revision '.
                'under a new code instead — see docs/modules/MatatagKeyStage1/MATATAG.md, '.
                '"Receiving a DepEd update".'
            );
        }

        $areaIds = [];

        foreach ($payload['learning_areas'] as $areaPayload) {
            $areaIds[] = $this->syncArea($version, $areaPayload);
        }

        $this->prune('matatag_learning_areas', ['curriculum_version_id' => $version->id], $areaIds);

        $this->assertCounts($version, $payload);

        $pinnedSections = DB::table('matatag_section_curricula')
            ->where('curriculum_version_id', $version->id)
            ->count();

        if ($pinnedSections > 0 && ! $force && $this->changedAnything()) {
            throw new CatalogLoadException(
                "Curriculum version '{$version->code}' is pinned by {$pinnedSections} section(s) ".
                'for the current year, and this file would change it. Re-run with --force if that '.
                'is genuinely intended, or publish the change under a new code.'
            );
        }

        $madeDefault = false;

        if ($makeDefault) {
            $madeDefault = $this->setGradeLevelDefault($version);
        }

        return new CatalogLoadResult(
            version: $version->refresh(),
            competencyCount: $version->competency_count,
            slotCount: $version->slot_count,
            changes: $this->changes,
            madeDefault: $madeDefault,
        );
    }

    // -----------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------

    /**
     * Everything that can be checked without a database, checked before one is
     * touched. A malformed file should never get as far as opening a
     * transaction.
     *
     * @throws CatalogLoadException
     */
    private function validate(array $payload): void
    {
        foreach (['version', 'counts', 'learning_areas'] as $key) {
            if (! isset($payload[$key]) || ! is_array($payload[$key])) {
                throw new CatalogLoadException("Catalog file is missing its '{$key}' block.");
            }
        }

        foreach (['code', 'title', 'grade_level'] as $key) {
            if (empty($payload['version'][$key])) {
                throw new CatalogLoadException("Catalog file is missing 'version.{$key}'.");
            }
        }

        foreach (['competencies', 'slots'] as $key) {
            if (! isset($payload['counts'][$key]) || ! is_int($payload['counts'][$key])) {
                throw new CatalogLoadException("Catalog file is missing an integer 'counts.{$key}'.");
            }
        }

        $gradeLevel = $payload['version']['grade_level'];

        if (! MatatagTerms::isKeyStageOne($gradeLevel)) {
            throw new CatalogLoadException(
                "Catalog file is for '{$gradeLevel}', which is not a Key Stage 1 grade level. ".
                'This module covers '.implode(', ', MatatagTerms::gradeLevels()).' only; Key Stage 2 '.
                'is a different instrument and does not belong in these tables.'
            );
        }

        if ($payload['learning_areas'] === []) {
            throw new CatalogLoadException('Catalog file lists no learning areas.');
        }

        foreach ($payload['learning_areas'] as $area) {
            $this->validateArea($area);
        }
    }

    private function validateArea(array $area): void
    {
        foreach (['key', 'title', 'shape'] as $key) {
            if (empty($area[$key])) {
                throw new CatalogLoadException("A learning area is missing '{$key}'.");
            }
        }

        $shapes = [MatatagLearningArea::SHAPE_YEAR_LIST, MatatagLearningArea::SHAPE_PER_TERM_LIST];

        if (! in_array($area['shape'], $shapes, true)) {
            throw new CatalogLoadException(
                "Learning area '{$area['key']}' has shape '{$area['shape']}', which is not one of ".
                implode(' or ', $shapes).'. A grade level that lays an area out a third way needs '.
                'the new shape taught to the grid first.'
            );
        }

        foreach ($area['domains'] ?? [] as $domain) {
            if (empty($domain['code']) || empty($domain['title'])) {
                throw new CatalogLoadException("A domain in '{$area['key']}' is missing a code or title.");
            }

            $this->assertTermInRange($area['key'], (int) ($domain['term'] ?? 0), allowYearLong: true);
        }

        $domainCodes = array_column($area['domains'] ?? [], 'code');

        foreach ($area['competencies'] ?? [] as $competency) {
            $this->validateCompetency($area, $competency, $domainCodes, isChild: false);
        }
    }

    private function validateCompetency(array $area, array $competency, array $domainCodes, bool $isChild): void
    {
        if (empty($competency['path'])) {
            throw new CatalogLoadException("A competency in '{$area['key']}' is missing its path.");
        }

        $path = $competency['path'];

        if (! isset($competency['text']) || trim((string) $competency['text']) === '') {
            throw new CatalogLoadException("Competency '{$path}' in '{$area['key']}' has no text.");
        }

        $this->assertTermInRange($area['key'], (int) ($competency['term'] ?? 0), allowYearLong: true);

        $domain = $competency['domain'] ?? null;

        if ($domain !== null && ! in_array($domain, $domainCodes, true)) {
            throw new CatalogLoadException(
                "Competency '{$path}' in '{$area['key']}' names domain '{$domain}', which the file ".
                'does not declare.'
            );
        }

        $children = $competency['children'] ?? [];
        $slots = $competency['slots'] ?? [];
        $isRateable = (bool) ($competency['is_rateable'] ?? true);

        if ($isChild && $children !== []) {
            throw new CatalogLoadException(
                "Competency '{$path}' in '{$area['key']}' nests a third level. The tree is exactly ".
                'two deep: a numbered competency may have lettered children, and those have none.'
            );
        }

        // A parent holds no marks and a rateable competency must be markable
        // somewhere, or the grid has a column with nothing behind it — or,
        // worse, a competency the teacher can never reach.
        if (! $isRateable && $slots !== []) {
            throw new CatalogLoadException(
                "Competency '{$path}' in '{$area['key']}' is not rateable but carries slots. Its ".
                'lettered children hold the marks.'
            );
        }

        if ($isRateable && $slots === [] && $children === []) {
            throw new CatalogLoadException(
                "Competency '{$path}' in '{$area['key']}' is rateable but has no slots and no ".
                'children, so no teacher could ever mark it.'
            );
        }

        foreach ($slots as $slot) {
            $this->validateSlot($area, $path, $slot);
        }

        foreach ($children as $child) {
            $this->validateCompetency($area, $child, $domainCodes, isChild: true);
        }
    }

    private function validateSlot(array $area, string $path, array $slot): void
    {
        $term = (int) ($slot['term'] ?? 0);

        if (! MatatagTerms::isValidTerm($term)) {
            throw new CatalogLoadException(
                "A slot on competency '{$path}' in '{$area['key']}' is for term {$term}. Key Stage 1 ".
                'has '.MatatagTerms::count().' terms, and a slot always belongs to one of them.'
            );
        }

        $macroSkill = $slot['macro_skill'] ?? MatatagTerms::NO_MACRO_SKILL;

        if (! MatatagTerms::isValidMacroSkill($macroSkill)) {
            throw new CatalogLoadException(
                "A slot on competency '{$path}' in '{$area['key']}' names macro skill ".
                "'{$macroSkill}', which config/matatag.php does not know. A grade level that ".
                'introduces a new one needs it added there, with its workbook fill colours.'
            );
        }

        $usesMacroSkills = (bool) ($area['uses_macro_skills'] ?? false);

        if (! $usesMacroSkills && $macroSkill !== MatatagTerms::NO_MACRO_SKILL) {
            throw new CatalogLoadException(
                "Learning area '{$area['key']}' does not use macro skills, but a slot on '{$path}' ".
                "carries '{$macroSkill}'."
            );
        }
    }

    private function assertTermInRange(string $areaKey, int $term, bool $allowYearLong): void
    {
        if ($allowYearLong && $term === 0) {
            return;
        }

        if (! MatatagTerms::isValidTerm($term)) {
            throw new CatalogLoadException("Learning area '{$areaKey}' uses term {$term}, which does not exist.");
        }
    }

    // -----------------------------------------------------------------
    // Writing
    // -----------------------------------------------------------------

    private function syncVersion(array $payload): MatatagCurriculumVersion
    {
        $existing = MatatagCurriculumVersion::where('code', $payload['code'])->first();

        $attributes = [
            'title' => $payload['title'],
            'grade_level' => MatatagTerms::canonicalGradeLevel($payload['grade_level']),
            'source' => $payload['source'] ?? null,
            'published_on' => $payload['published_on'] ?? null,
        ];

        if ($existing) {
            // Counts are written at the end, once they have been asserted.
            $existing->fill($attributes);

            if ($existing->isDirty()) {
                $existing->save();
                $this->count('matatag_curriculum_versions', 'updated');
            }

            return $existing;
        }

        $version = MatatagCurriculumVersion::create($attributes + ['code' => $payload['code']]);
        $this->count('matatag_curriculum_versions', 'created');

        return $version;
    }

    private function syncArea(MatatagCurriculumVersion $version, array $payload): string
    {
        $areaId = $this->syncRow(
            table: 'matatag_learning_areas',
            scope: ['curriculum_version_id' => $version->id, 'key' => $payload['key']],
            attributes: [
                'title' => $payload['title'],
                'shape' => $payload['shape'],
                'uses_macro_skills' => (bool) ($payload['uses_macro_skills'] ?? false),
                'has_domains' => (bool) ($payload['has_domains'] ?? false),
                'carries_values' => (bool) ($payload['carries_values'] ?? false),
                'sort_order' => (int) ($payload['sort_order'] ?? 0),
            ],
        );

        $domainIds = $this->syncDomains($areaId, $payload['domains'] ?? []);

        [$competencyIds, $slotIds] = $this->syncCompetencies(
            $areaId,
            $domainIds,
            $payload['competencies'] ?? [],
            parentId: null,
        );

        // Slots first, then competencies, then domains: each prune removes
        // rows the next one's foreign keys would otherwise still hold.
        $this->prune('matatag_competency_slots', ['learning_area_id' => $areaId], $slotIds);
        $this->prune('matatag_competencies', ['learning_area_id' => $areaId], $competencyIds);
        $this->prune('matatag_domains', ['learning_area_id' => $areaId], $domainIds);

        return $areaId;
    }

    /**
     * @return array<string, string> domain "term:code" => id
     */
    private function syncDomains(string $areaId, array $domains): array
    {
        $ids = [];

        foreach ($domains as $index => $domain) {
            $term = (int) ($domain['term'] ?? 0);

            $id = $this->syncRow(
                table: 'matatag_domains',
                scope: ['learning_area_id' => $areaId, 'term' => $term, 'code' => $domain['code']],
                attributes: [
                    'title' => $domain['title'],
                    'sort_order' => (int) ($domain['sort_order'] ?? $index + 1),
                ],
            );

            $ids[$term.':'.$domain['code']] = $id;
        }

        return $ids;
    }

    /**
     * @param  array<string, string>  $domainIds
     * @return array{0: array<int, string>, 1: array<int, string>} competency ids, slot ids
     */
    private function syncCompetencies(string $areaId, array $domainIds, array $competencies, ?string $parentId): array
    {
        $competencyIds = [];
        $slotIds = [];

        foreach ($competencies as $index => $competency) {
            $term = (int) ($competency['term'] ?? 0);
            $domainCode = $competency['domain'] ?? null;

            // A domain belonging to one term is keyed by that term; a
            // year-spanning one by 0. Try the competency's own term first so a
            // per-term area resolves, then fall back.
            $domainId = null;

            if ($domainCode !== null) {
                $domainId = $domainIds[$term.':'.$domainCode] ?? $domainIds['0:'.$domainCode] ?? null;
            }

            $extra = $competency['extra'] ?? null;

            $id = $this->syncRow(
                table: 'matatag_competencies',
                scope: ['learning_area_id' => $areaId, 'path' => $competency['path']],
                attributes: [
                    'domain_id' => $domainId,
                    'parent_id' => $parentId,
                    'term' => $term,
                    'number' => $competency['number'] ?? null,
                    'letter' => $competency['letter'] ?? null,
                    'label' => (string) ($competency['label'] ?? ''),
                    'text' => $competency['text'],
                    'performance_standard' => $competency['performance_standard'] ?? null,
                    'extra' => $extra === null ? null : json_encode($extra, JSON_UNESCAPED_UNICODE),
                    'is_rateable' => (bool) ($competency['is_rateable'] ?? true),
                    'sort_order' => (int) ($competency['sort_order'] ?? $index + 1),
                ],
                // MySQL normalises a JSON column's whitespace and key order on
                // write, so comparing it as text would report a change on every
                // single run.
                jsonColumns: ['extra'],
            );

            $competencyIds[] = $id;

            foreach ($competency['slots'] ?? [] as $slotIndex => $slot) {
                $slotIds[] = $this->syncRow(
                    table: 'matatag_competency_slots',
                    scope: [
                        'competency_id' => $id,
                        'term' => (int) $slot['term'],
                        'macro_skill' => $slot['macro_skill'] ?? MatatagTerms::NO_MACRO_SKILL,
                    ],
                    attributes: [
                        'learning_area_id' => $areaId,
                        'sort_order' => (int) ($slot['sort_order'] ?? $slotIndex + 1),
                    ],
                );
            }

            if (! empty($competency['children'])) {
                [$childIds, $childSlotIds] = $this->syncCompetencies(
                    $areaId,
                    $domainIds,
                    $competency['children'],
                    parentId: $id,
                );

                $competencyIds = array_merge($competencyIds, $childIds);
                $slotIds = array_merge($slotIds, $childSlotIds);
            }
        }

        return [$competencyIds, $slotIds];
    }

    /**
     * Create, update in place, or leave alone — the whole idempotency rule, in
     * one method, keyed on the natural key in `$scope`.
     *
     * @param  array<string, mixed>  $scope  the natural key
     * @param  array<string, mixed>  $attributes  everything else
     * @param  array<int, string>  $jsonColumns  columns to compare decoded, not as text
     * @return string the row's id, stable across re-runs
     */
    private function syncRow(string $table, array $scope, array $attributes, array $jsonColumns = []): string
    {
        $existing = DB::table($table)->where($scope)->first();
        $now = now();

        if ($existing === null) {
            $id = (string) Str::uuid7();

            DB::table($table)->insert($scope + $attributes + [
                'id' => $id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->count($table, 'created');

            return $id;
        }

        $dirty = [];

        foreach ($attributes as $column => $value) {
            $current = $existing->{$column} ?? null;

            // Loose comparison on purpose: the driver hands booleans back as
            // 0/1 and integers as strings, and a strict test would rewrite
            // every row on every run and report a change that never happened.
            $same = in_array($column, $jsonColumns, true)
                ? json_decode((string) $current, true) == json_decode((string) $value, true)
                : $this->sameValue($current, $value);

            if (! $same) {
                $dirty[$column] = $value;
            }
        }

        if ($dirty !== []) {
            DB::table($table)->where('id', $existing->id)->update($dirty + ['updated_at' => $now]);
            $this->count($table, 'updated');
        }

        return $existing->id;
    }

    private function sameValue(mixed $current, mixed $value): bool
    {
        if ($current === null || $value === null) {
            return $current === null && $value === null;
        }

        if (is_bool($value)) {
            return (bool) $current === $value;
        }

        if (is_int($value)) {
            return (int) $current === $value;
        }

        return (string) $current === (string) $value;
    }

    /**
     * Delete the rows in `$scope` that this load did not write.
     *
     * This is what makes a revision that *removes* a competency actually
     * remove it. If the removed row is in use the database refuses — slots are
     * `ON DELETE RESTRICT` from the ratings table — and the whole load rolls
     * back, which is the correct outcome: you cannot delete a competency a
     * child has been marked against.
     *
     * @param  array<int, string>  $keepIds
     */
    private function prune(string $table, array $scope, array $keepIds): void
    {
        $query = DB::table($table)->where($scope);

        if ($keepIds !== []) {
            $query->whereNotIn('id', $keepIds);
        }

        $deleted = $query->delete();

        if ($deleted > 0) {
            $this->count($table, 'deleted', $deleted);
        }
    }

    private function setGradeLevelDefault(MatatagCurriculumVersion $version): bool
    {
        $current = DB::table('matatag_grade_level_curricula')
            ->where('grade_level', $version->grade_level)
            ->value('curriculum_version_id');

        if ($current === $version->id) {
            return false;
        }

        DB::table('matatag_grade_level_curricula')->updateOrInsert(
            ['grade_level' => $version->grade_level],
            ['curriculum_version_id' => $version->id, 'updated_at' => now(), 'created_at' => now()],
        );

        return true;
    }

    // -----------------------------------------------------------------
    // The counts assertion
    // -----------------------------------------------------------------

    /**
     * Compare the file's own stated counts against what is actually in the
     * database, per area and in total, and roll the load back on any
     * disagreement.
     *
     * Counting from the database rather than from the payload is the point: it
     * catches a duplicate key silently collapsing two competencies into one,
     * which counting the array would not.
     */
    private function assertCounts(MatatagCurriculumVersion $version, array $payload): void
    {
        $problems = [];

        foreach ($payload['learning_areas'] as $areaPayload) {
            $expected = $areaPayload['counts'] ?? null;

            if (! is_array($expected)) {
                continue;
            }

            $areaId = DB::table('matatag_learning_areas')
                ->where('curriculum_version_id', $version->id)
                ->where('key', $areaPayload['key'])
                ->value('id');

            $actualCompetencies = DB::table('matatag_competencies')->where('learning_area_id', $areaId)->count();
            $actualSlots = DB::table('matatag_competency_slots')->where('learning_area_id', $areaId)->count();

            if (isset($expected['competencies']) && (int) $expected['competencies'] !== $actualCompetencies) {
                $problems[] = "{$areaPayload['key']}: file says {$expected['competencies']} competencies, ".
                    "database holds {$actualCompetencies}";
            }

            if (isset($expected['slots']) && (int) $expected['slots'] !== $actualSlots) {
                $problems[] = "{$areaPayload['key']}: file says {$expected['slots']} slots, ".
                    "database holds {$actualSlots}";
            }
        }

        $areaIds = DB::table('matatag_learning_areas')
            ->where('curriculum_version_id', $version->id)
            ->pluck('id');

        $totalCompetencies = DB::table('matatag_competencies')->whereIn('learning_area_id', $areaIds)->count();
        $totalSlots = DB::table('matatag_competency_slots')->whereIn('learning_area_id', $areaIds)->count();

        if ((int) $payload['counts']['competencies'] !== $totalCompetencies) {
            $problems[] = "total: file says {$payload['counts']['competencies']} competencies, ".
                "database holds {$totalCompetencies}";
        }

        if ((int) $payload['counts']['slots'] !== $totalSlots) {
            $problems[] = "total: file says {$payload['counts']['slots']} slots, database holds {$totalSlots}";
        }

        if ($problems !== []) {
            throw new CatalogLoadException(
                "Catalog '{$version->code}' does not match its own stated counts, so nothing was ".
                'written. This usually means the extraction lost or duplicated something — a slot '.
                "exists only by virtue of a macro-skill fill colour. Differences:\n  - ".
                implode("\n  - ", $problems)
            );
        }

        DB::table('matatag_curriculum_versions')
            ->where('id', $version->id)
            ->update([
                'competency_count' => $totalCompetencies,
                'slot_count' => $totalSlots,
                'updated_at' => now(),
            ]);

        $version->competency_count = $totalCompetencies;
        $version->slot_count = $totalSlots;
    }

    // -----------------------------------------------------------------

    private function count(string $table, string $kind, int $by = 1): void
    {
        $this->changes[$table] ??= ['created' => 0, 'updated' => 0, 'deleted' => 0];
        $this->changes[$table][$kind] += $by;
    }

    private function changedAnything(): bool
    {
        foreach ($this->changes as $counts) {
            if ($counts['created'] || $counts['updated'] || $counts['deleted']) {
                return true;
            }
        }

        return false;
    }
}
