<?php

namespace App\Services\Matatag;

use App\Models\MatatagCompetency;
use App\Models\MatatagCompetencySlot;
use App\Models\MatatagCurriculumVersion;
use App\Models\MatatagDomain;
use App\Models\MatatagLearningArea;
use Illuminate\Support\Collection;

/**
 * Reads a catalog version out of the database in the two shapes clients need.
 *
 * `forVersion()` is the whole tree, served once and cached hard by the client —
 * a quarter of a megabyte that changes when DepEd publishes, which is roughly
 * once a year. `columnsFor()` is one (area, term) block: the columns of the
 * entry grid, flattened into exactly what a `<th>` needs.
 *
 * ## Nothing here branches on a learning area's key or on a grade level
 *
 * Grade 2's areas may be different areas entirely, and Grade 3 may lay one out
 * a third way. Every decision is read off `shape`, `uses_macro_skills`,
 * `has_domains` and `carries_values`, which are columns. That is what makes a
 * new grade level a JSON file and a migration rather than a code change, and
 * it is the single rule this class exists to hold.
 */
class CurriculumTree
{
    /**
     * The whole catalog: areas, their domains, and their competencies with the
     * slots hanging off each.
     *
     * Four queries regardless of catalog size — the tree is assembled in PHP
     * rather than by walking relations, because `->with('children.slots')` on
     * 199 competencies is where an N+1 would hide.
     */
    public function forVersion(MatatagCurriculumVersion $version): array
    {
        $areas = MatatagLearningArea::where('curriculum_version_id', $version->id)
            ->orderBy('sort_order')
            ->get();

        $areaIds = $areas->pluck('id');

        $domains = MatatagDomain::whereIn('learning_area_id', $areaIds)
            ->orderBy('term')->orderBy('sort_order')
            ->get()
            ->groupBy('learning_area_id');

        $competencies = MatatagCompetency::whereIn('learning_area_id', $areaIds)
            ->orderBy('term')->orderBy('sort_order')
            ->get();

        $slots = MatatagCompetencySlot::whereIn('learning_area_id', $areaIds)
            ->orderBy('term')->orderBy('sort_order')
            ->get()
            ->groupBy('competency_id');

        $children = $competencies->whereNotNull('parent_id')->groupBy('parent_id');

        return [
            'version' => $this->version($version),
            'learning_areas' => $areas->map(fn (MatatagLearningArea $area) => [
                ...$this->area($area),
                'domains' => ($domains[$area->id] ?? collect())
                    ->map(fn (MatatagDomain $d) => $this->domain($d))->values()->all(),
                'competencies' => $competencies
                    ->where('learning_area_id', $area->id)
                    ->whereNull('parent_id')
                    ->map(fn (MatatagCompetency $c) => $this->competency($c, $slots, $children))
                    ->values()->all(),
            ])->values()->all(),
        ];
    }

    /**
     * The columns of one (area, term) block of the entry grid.
     *
     * Flat, and in the order the PACE form prints: domain band, then
     * competency, then a lettered child under its parent, then that
     * competency's macro skills side by side.
     *
     * That order has to be computed rather than read off a column.
     * `matatag_competency_slots.sort_order` counts within one competency —
     * Listening 1, Speaking 2 — and `matatag_competencies.sort_order` counts
     * within a parent for a lettered child. Sorting on either alone
     * interleaves children with their parents' neighbours, so the key is the
     * whole tuple: parent position, child position, then macro skill.
     *
     * A cell's identity is its slot, so `slot_id` is what the client writes
     * back. Never a competency id — that stops identifying a cell the moment
     * an area uses macro skills.
     *
     * The competency's full text rides along because the grid's header cannot
     * show it: the official entry sheet's heading is number and letter only,
     * and ~200 characters of competency will not fit above a one-letter cell.
     * The client shows it in the inspector strip when a cell is focused.
     *
     * @return array<int, array<string, mixed>>
     */
    public function columnsFor(MatatagLearningArea $area, int $term): array
    {
        $slots = MatatagCompetencySlot::where('learning_area_id', $area->id)
            ->where('term', $term)
            ->get();

        if ($slots->isEmpty()) {
            return [];
        }

        $competencies = MatatagCompetency::whereIn('id', $slots->pluck('competency_id')->unique())
            ->get()
            ->keyBy('id');

        $parents = MatatagCompetency::whereIn(
            'id',
            $competencies->pluck('parent_id')->filter()->unique()
        )->get()->keyBy('id');

        $rows = [];

        foreach ($slots as $slot) {
            $competency = $competencies[$slot->competency_id];
            $parent = $competency->parent_id ? ($parents[$competency->parent_id] ?? null) : null;
            $top = $parent ?? $competency;

            $rows[] = [
                'order' => [
                    $top->term,
                    $top->sort_order,
                    $parent ? $competency->sort_order : 0,
                    $slot->sort_order,
                ],
                'column' => [
                    'slot_id' => $slot->id,
                    'competency_id' => $competency->id,
                    'domain_id' => $competency->domain_id,
                    'term' => $slot->term,
                    'macro_skill' => $area->uses_macro_skills ? $slot->macro_skill : null,
                    'number' => $competency->number,
                    'letter' => $competency->letter,
                    'label' => $competency->label,
                    'text' => $competency->text,
                    'performance_standard' => $competency->performance_standard,
                    'extra' => $competency->extra,
                    // What the grid's grouping header spans: a lettered child
                    // prints under its parent's number.
                    'parent_label' => $parent?->label,
                    'parent_text' => $parent?->text,
                ],
            ];
        }

        usort($rows, fn ($a, $b) => $a['order'] <=> $b['order']);

        return array_map(
            fn ($row, $index) => $row['column'] + ['sort_order' => $index + 1],
            $rows,
            array_keys($rows),
        );
    }

    /**
     * The domains of an area, in print order — of one term, or of the whole
     * year when no term is named.
     *
     * A domain is either year-spanning (`term = 0`) or owned by one term.
     * Mathematics prints two per term drawn from three across the year, so
     * neither "always three" nor "always year-long" is safe to assume.
     *
     * @return array<int, array<string, mixed>>
     */
    public function domainsFor(MatatagLearningArea $area, ?int $term = null): array
    {
        return MatatagDomain::where('learning_area_id', $area->id)
            // No term named means the whole year, which is what a PACE form
            // prints. The entry grid always names one.
            ->when($term !== null, fn ($q) => $q->whereIn('term', [0, $term]))
            ->orderBy('term')->orderBy('sort_order')
            ->get()
            ->map(fn (MatatagDomain $d) => $this->domain($d))
            ->values()->all();
    }

    /**
     * One learning area's rows as the PACE form prints them: every rateable
     * competency of the whole year, each carrying all of its slots.
     *
     * This is `columnsFor()` turned ninety degrees. The entry grid is one term
     * wide and slots are its columns; the PACE form is a year long, competencies
     * are its rows, and a competency's slots are the boxes along the row — one
     * per (term, macro skill) it is actually assessed in. So a Reading &
     * Literacy competency taught in all three terms prints one row with up to
     * twelve boxes, while a GMRC value prints one row with one.
     *
     * Only rateable competencies appear. A numbered parent holds no slots — its
     * lettered children carry the marks — so it contributes its label and text
     * to each child row via `parent_label` / `parent_text` rather than a row of
     * its own with nothing to fill in.
     *
     * The ordering tuple is `columnsFor()`'s minus the slot, and for the same
     * reason: `sort_order` counts within a parent, so sorting on it alone
     * interleaves children with their parents' neighbours.
     *
     * @return array<int, array<string, mixed>>
     */
    public function paceRowsFor(MatatagLearningArea $area): array
    {
        $competencies = MatatagCompetency::where('learning_area_id', $area->id)->get();
        $byId = $competencies->keyBy('id');

        $slots = MatatagCompetencySlot::where('learning_area_id', $area->id)
            ->orderBy('term')->orderBy('sort_order')
            ->get()
            ->groupBy('competency_id');

        $rows = [];

        foreach ($competencies as $competency) {
            $own = $slots[$competency->id] ?? collect();

            if ($own->isEmpty()) {
                continue;
            }

            $parent = $competency->parent_id ? ($byId[$competency->parent_id] ?? null) : null;
            $top = $parent ?? $competency;

            $rows[] = [
                'order' => [$top->term, $top->sort_order, $parent ? $competency->sort_order : 0],
                'row' => [
                    'competency_id' => $competency->id,
                    'path' => $competency->path,
                    'domain_id' => $competency->domain_id,
                    'term' => $competency->term,
                    'number' => $competency->number,
                    'letter' => $competency->letter,
                    'label' => $competency->label,
                    'text' => $competency->text,
                    // GMRC's `text` is the value cultivated and this is the
                    // Filipino sentence printed beside it; null everywhere else.
                    'performance_standard' => $competency->performance_standard,
                    'extra' => $competency->extra,
                    'parent_label' => $parent?->label,
                    'parent_text' => $parent?->text,
                    'slots' => $own->map(fn (MatatagCompetencySlot $s) => [
                        'id' => $s->id,
                        'term' => $s->term,
                        'macro_skill' => $area->uses_macro_skills ? $s->macro_skill : null,
                        'sort_order' => $s->sort_order,
                    ])->values()->all(),
                ],
            ];
        }

        usort($rows, fn ($a, $b) => $a['order'] <=> $b['order']);

        return array_column($rows, 'row');
    }

    /**
     * How many slots each term of an area holds — the curriculum's pacing,
     * which the client needs in order to label its term selector honestly
     * rather than offering a term with nothing in it.
     *
     * @return array<int, int>
     */
    public function slotCountsByTerm(MatatagLearningArea $area): array
    {
        $counts = MatatagCompetencySlot::where('learning_area_id', $area->id)
            ->selectRaw('term, COUNT(*) as total')
            ->groupBy('term')
            ->pluck('total', 'term');

        $out = [];

        foreach (\App\Support\MatatagTerms::values() as $term) {
            $out[$term] = (int) ($counts[$term] ?? 0);
        }

        return $out;
    }

    public function version(MatatagCurriculumVersion $version): array
    {
        return [
            'id' => $version->id,
            'code' => $version->code,
            'title' => $version->title,
            'grade_level' => $version->grade_level,
            'source' => $version->source,
            'published_on' => $version->published_on?->toDateString(),
            'competency_count' => $version->competency_count,
            'slot_count' => $version->slot_count,
            'locked' => $version->isLocked(),
        ];
    }

    public function area(MatatagLearningArea $area): array
    {
        return [
            'id' => $area->id,
            'key' => $area->key,
            'title' => $area->title,
            'shape' => $area->shape,
            'uses_macro_skills' => $area->uses_macro_skills,
            'has_domains' => $area->has_domains,
            'carries_values' => $area->carries_values,
            'sort_order' => $area->sort_order,
        ];
    }

    private function domain(MatatagDomain $domain): array
    {
        return [
            'id' => $domain->id,
            'code' => $domain->code,
            'title' => $domain->title,
            'term' => $domain->term,
            'sort_order' => $domain->sort_order,
        ];
    }

    /**
     * @param  Collection<string, Collection<int, MatatagCompetencySlot>>  $slots
     * @param  Collection<string, Collection<int, MatatagCompetency>>  $children
     */
    private function competency(
        MatatagCompetency $competency,
        Collection $slots,
        Collection $children,
    ): array {
        return [
            'id' => $competency->id,
            'path' => $competency->path,
            'domain_id' => $competency->domain_id,
            'term' => $competency->term,
            'number' => $competency->number,
            'letter' => $competency->letter,
            'label' => $competency->label,
            'text' => $competency->text,
            'performance_standard' => $competency->performance_standard,
            'extra' => $competency->extra,
            'is_rateable' => $competency->is_rateable,
            'sort_order' => $competency->sort_order,
            'slots' => ($slots[$competency->id] ?? collect())
                ->map(fn (MatatagCompetencySlot $s) => [
                    'id' => $s->id,
                    'term' => $s->term,
                    'macro_skill' => $s->macro_skill,
                    'sort_order' => $s->sort_order,
                ])->values()->all(),
            'children' => ($children[$competency->id] ?? collect())
                ->sortBy('sort_order')
                ->map(fn (MatatagCompetency $c) => $this->competency($c, $slots, collect()))
                ->values()->all(),
        ];
    }
}
