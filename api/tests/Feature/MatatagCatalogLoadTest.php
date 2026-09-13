<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\MatatagCompetency;
use App\Models\MatatagCompetencyRating;
use App\Models\MatatagCompetencySlot;
use App\Models\MatatagCurriculumVersion;
use App\Models\MatatagGradeLevelCurriculum;
use App\Models\MatatagLearningArea;
use App\Models\MatatagSectionCurriculum;
use App\Models\Student;
use App\Services\Matatag\CatalogLoader;
use App\Services\Matatag\CatalogLoadException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The catalog is the module's foundation, and this is the test that decides
 * whether it can be trusted.
 *
 * Two kinds of assertion live here, and they are doing different jobs.
 *
 * The first kind checks the **real Grade 1 artifact** — 199 competencies, 604
 * slots, and the per-area and per-term splits. Those numbers were read off
 * DepEd's workbook by hand and confirmed a second time by a probe that reads
 * the class-summary sheets independently of the extractor. They are here so a
 * future re-extraction that quietly loses a macro-skill fill fails in CI
 * rather than reaching a teacher who cannot find a competency. A slot exists
 * *only* by virtue of a cell's background colour, so this is the most
 * loseable data in the module.
 *
 * The second kind checks the **versioning promise**: that a catalog in use
 * cannot be rewritten, and that a revision cannot move descriptors already
 * recorded against an earlier version. Everything else in MATATAG rests on
 * that, and it is guaranteed at four levels — the loader's lock check, its
 * natural keys being scoped to one version, the section's year-long pin, and a
 * foreign key the database itself enforces. The last one is the only guarantee
 * that survives a bug in the other three, so it is tested directly.
 */
class MatatagCatalogLoadTest extends TestCase
{
    use RefreshDatabase;

    private const CODE = 'deped-matatag-ks1-grade-1-v1';

    /** What the workbook holds, per area: [competencies, slots, T1, T2, T3]. */
    private const EXPECTED = [
        'reading-literacy' => [42, 241, 74, 76, 91],
        'language' => [64, 273, 89, 89, 95],
        'mathematics' => [54, 52, 17, 21, 14],
        'gmrc' => [24, 24, 7, 9, 8],
        'makabansa' => [15, 14, 4, 3, 7],
    ];

    private const TOTAL_COMPETENCIES = 199;

    private const TOTAL_SLOTS = 604;

    private function catalogPath(): string
    {
        return database_path('data/matatag/grade-1.v1.json');
    }

    private function payload(): array
    {
        return CatalogLoader::decodeFile($this->catalogPath());
    }

    private function version(): MatatagCurriculumVersion
    {
        return MatatagCurriculumVersion::where('code', self::CODE)->firstOrFail();
    }

    // -----------------------------------------------------------------
    // The real artifact
    // -----------------------------------------------------------------

    /**
     * The data migration has already run by the time any test starts, so this
     * asserts the state every tenant actually deploys with.
     */
    public function test_the_grade_1_catalog_is_present_after_migrating(): void
    {
        $version = $this->version();

        $this->assertSame('Grade 1', $version->grade_level);
        $this->assertSame(self::TOTAL_COMPETENCIES, $version->competency_count);
        $this->assertSame(self::TOTAL_SLOTS, $version->slot_count);
        $this->assertNull($version->locked_at, 'A freshly loaded catalog must not be locked.');

        $this->assertSame(
            self::TOTAL_COMPETENCIES,
            MatatagCompetency::count(),
            'Competency rows in the database must match the workbook.'
        );

        $this->assertSame(
            self::TOTAL_SLOTS,
            MatatagCompetencySlot::count(),
            'Slot rows in the database must match the workbook. A slot exists only by virtue of '
            .'a macro-skill fill colour, so a short count means the extraction lost one.'
        );

        $this->assertSame(
            $version->id,
            MatatagGradeLevelCurriculum::find('Grade 1')?->curriculum_version_id,
            'Grade 1 must have a default catalog, or no section can opt in.'
        );
    }

    public function test_every_learning_area_holds_exactly_what_the_workbook_does(): void
    {
        $version = $this->version();

        $this->assertSame(
            array_keys(self::EXPECTED),
            $version->learningAreas->pluck('key')->all(),
            'The five Grade 1 learning areas, in the order the PACE form prints them.'
        );

        foreach (self::EXPECTED as $key => [$competencies, $slots, $t1, $t2, $t3]) {
            $area = $version->learningAreas->firstWhere('key', $key);

            $this->assertSame(
                $competencies,
                MatatagCompetency::where('learning_area_id', $area->id)->count(),
                "{$key}: competency count"
            );

            $this->assertSame(
                $slots,
                MatatagCompetencySlot::where('learning_area_id', $area->id)->count(),
                "{$key}: slot count"
            );

            foreach ([1 => $t1, 2 => $t2, 3 => $t3] as $term => $expected) {
                $this->assertSame(
                    $expected,
                    MatatagCompetencySlot::where('learning_area_id', $area->id)
                        ->where('term', $term)->count(),
                    "{$key}: term {$term} slot count — this is the curriculum's pacing, and a "
                    .'wrong number here means a teacher is shown the wrong columns.'
                );
            }
        }
    }

    /**
     * The two shapes are what the entry grid and the PACE form branch on.
     * Nothing may branch on an area's key or on the grade level, so these
     * flags have to be right in the data.
     */
    public function test_each_area_declares_the_shape_the_grid_will_branch_on(): void
    {
        $areas = $this->version()->learningAreas->keyBy('key');

        foreach (['reading-literacy', 'language'] as $key) {
            $this->assertSame(MatatagLearningArea::SHAPE_YEAR_LIST, $areas[$key]->shape);
            $this->assertTrue($areas[$key]->uses_macro_skills, "{$key} is rated per macro skill.");
            $this->assertSame(0, MatatagCompetency::where('learning_area_id', $areas[$key]->id)
                ->where('term', '!=', 0)->count(), "{$key} lists competencies for the whole year.");
        }

        foreach (['mathematics', 'gmrc', 'makabansa'] as $key) {
            $this->assertSame(MatatagLearningArea::SHAPE_PER_TERM_LIST, $areas[$key]->shape);
            $this->assertFalse($areas[$key]->uses_macro_skills, "{$key} has no macro skills.");
            $this->assertSame(0, MatatagCompetency::where('learning_area_id', $areas[$key]->id)
                ->where('term', 0)->count(), "{$key} lists a separate set of competencies per term.");
        }

        $this->assertTrue($areas['gmrc']->carries_values);
        $this->assertSame(
            24,
            MatatagCompetency::where('learning_area_id', $areas['gmrc']->id)
                ->whereNotNull('performance_standard')->count(),
            'Every GMRC value prints a performance standard beside it.'
        );
    }

    /**
     * The tree is exactly two levels, a parent holds no marks, and anything
     * rateable is reachable. A violation of any of these is a column in the
     * grid with nothing behind it, or a competency no teacher can ever mark.
     */
    public function test_the_competency_tree_is_two_levels_and_every_mark_has_a_home(): void
    {
        $childIds = MatatagCompetency::whereNotNull('parent_id')->pluck('id');

        $this->assertSame(
            0,
            MatatagCompetency::whereIn('parent_id', $childIds)->count(),
            'A lettered child may not itself have children.'
        );

        $this->assertSame(
            0,
            MatatagCompetency::where('is_rateable', false)->whereHas('slots')->count(),
            'A parent competency holds no slots; its children hold the marks.'
        );

        $this->assertSame(
            0,
            MatatagCompetency::where('is_rateable', true)->doesntHave('slots')->count(),
            'A rateable competency with no slots could never be marked.'
        );

        $this->assertSame(
            0,
            MatatagCompetencySlot::whereIn('competency_id',
                MatatagCompetency::where('is_rateable', false)->select('id'))->count()
        );
    }

    /**
     * Language competency 8 is the one the old extractor got wrong, and it is
     * worth pinning by name.
     *
     * `TERM 3 LANGUAGE` is two columns wider than Terms 1 and 2 — DepEd
     * inserted a child pair under competency 6 — so reading Term 1's column
     * numbers against the Term 3 sheet lands on a neighbour. Competency 8 is
     * assessed on child *b* in Term 3 and on child *a* in Terms 1 and 2, which
     * is precisely the shape that makes the shift visible. Everywhere both
     * children are assessed, the wrong read lands on another filled cell and
     * the totals still come out right.
     */
    public function test_the_term_3_language_column_shift_is_attributed_correctly(): void
    {
        $language = $this->version()->learningAreas->firstWhere('key', 'language');

        $terms = fn (string $path) => MatatagCompetencySlot::whereIn(
            'competency_id',
            MatatagCompetency::where('learning_area_id', $language->id)->where('path', $path)->select('id')
        )->distinct()->orderBy('term')->pluck('term')->all();

        $this->assertSame([1, 2], $terms('.8.a'), 'Competency 8a is assessed in Terms 1 and 2 only.');
        $this->assertSame([3], $terms('.8.b'), 'Competency 8b is assessed in Term 3 only.');
        $this->assertSame([3], $terms('.8.c'), 'Competency 8c is assessed in Term 3 only.');

        // The inserted pair is a copied heading, not a second assessment.
        $this->assertSame(
            2,
            MatatagCompetencySlot::whereIn(
                'competency_id',
                MatatagCompetency::where('learning_area_id', $language->id)->where('path', '.6.b')->select('id')
            )->where('term', 3)->count(),
            'Competency 6b is assessed once for listening and once for speaking in Term 3, not twice.'
        );
    }

    // -----------------------------------------------------------------
    // Idempotency
    // -----------------------------------------------------------------

    /**
     * Loading the same file again must change nothing at all — not the row
     * counts, and not the ids, because the ids are what descriptors point at.
     */
    public function test_loading_the_same_catalog_again_changes_nothing(): void
    {
        $before = [
            'versions' => MatatagCurriculumVersion::count(),
            'areas' => MatatagLearningArea::count(),
            'competencies' => MatatagCompetency::count(),
            'slots' => MatatagCompetencySlot::count(),
        ];

        $slotIdsBefore = MatatagCompetencySlot::orderBy('id')->pluck('id')->all();

        $result = (new CatalogLoader)->load($this->payload(), makeDefault: true);

        $this->assertFalse(
            $result->changedAnything(),
            'A re-load of an unchanged file must report no changes, or the module will look '
            .'like it is rewriting the catalog on every deploy.'
        );

        $this->assertSame($before, [
            'versions' => MatatagCurriculumVersion::count(),
            'areas' => MatatagLearningArea::count(),
            'competencies' => MatatagCompetency::count(),
            'slots' => MatatagCompetencySlot::count(),
        ]);

        $this->assertSame(
            $slotIdsBefore,
            MatatagCompetencySlot::orderBy('id')->pluck('id')->all(),
            'Slot ids must survive a re-load byte for byte: they are the foreign key every '
            .'recorded descriptor points at.'
        );
    }

    public function test_the_artisan_command_loads_the_catalog_and_reports_no_change(): void
    {
        $this->artisan('matatag:load-catalog', [
            'file' => 'database/data/matatag/grade-1.v1.json',
            '--default' => true,
        ])
            ->expectsOutputToContain('199 competencies, 604 slots')
            ->expectsOutputToContain('Already loaded and unchanged')
            ->assertExitCode(0);
    }

    public function test_a_dry_run_writes_nothing(): void
    {
        MatatagCompetency::where('path', '.1')->update(['text' => 'Changed by the test.']);

        $this->artisan('matatag:load-catalog', [
            'file' => 'database/data/matatag/grade-1.v1.json',
            '--dry-run' => true,
        ])->assertExitCode(0);

        $this->assertSame(
            'Changed by the test.',
            MatatagCompetency::where('path', '.1')->value('text'),
            'A dry run must roll back, including the corrections it would have made.'
        );
    }

    // -----------------------------------------------------------------
    // The counts assertion
    // -----------------------------------------------------------------

    public function test_a_file_that_disagrees_with_its_own_counts_is_rejected_whole(): void
    {
        $payload = $this->payload();

        // Drop one slot, leaving the competency still markable, without
        // adjusting the counts block — exactly what a re-extraction that
        // missed one fill colour would produce.
        $slots = $payload['learning_areas'][0]['competencies'][0]['slots'];
        $this->assertGreaterThan(1, count($slots));
        $payload['learning_areas'][0]['competencies'][0]['slots'] = array_slice($slots, 1);

        $slotsBefore = MatatagCompetencySlot::count();

        try {
            (new CatalogLoader)->load($payload);
            $this->fail('A catalog that does not match its stated counts must be refused.');
        } catch (CatalogLoadException $e) {
            $this->assertStringContainsString('does not match its own stated counts', $e->getMessage());
            $this->assertStringContainsString('reading-literacy', $e->getMessage());
        }

        $this->assertSame(
            $slotsBefore,
            MatatagCompetencySlot::count(),
            'The whole load must roll back — a half-loaded catalog is worse than none.'
        );
    }

    public function test_a_catalog_for_another_key_stage_is_refused(): void
    {
        $payload = $this->payload();
        $payload['version']['code'] = 'deped-matatag-ks2-grade-4-v1';
        $payload['version']['grade_level'] = 'Grade 4';

        $this->expectException(CatalogLoadException::class);
        $this->expectExceptionMessage('not a Key Stage 1 grade level');

        (new CatalogLoader)->load($payload);
    }

    public function test_a_slot_naming_an_unknown_macro_skill_is_refused(): void
    {
        $payload = $this->payload();
        $payload['learning_areas'][0]['competencies'][0]['slots'][0]['macro_skill'] = 'dancing';

        $this->expectException(CatalogLoadException::class);
        $this->expectExceptionMessage('dancing');

        (new CatalogLoader)->load($payload);
    }

    // -----------------------------------------------------------------
    // The versioning promise
    // -----------------------------------------------------------------

    public function test_a_locked_catalog_is_never_rewritten(): void
    {
        $version = $this->version();
        $version->forceFill(['locked_at' => now()])->save();

        $payload = $this->payload();
        $payload['learning_areas'][0]['competencies'][0]['text'] = 'Revised wording.';

        try {
            (new CatalogLoader)->load($payload, makeDefault: false, force: true);
            $this->fail('A locked catalog must be refused even with --force.');
        } catch (CatalogLoadException $e) {
            $this->assertStringContainsString('is locked', $e->getMessage());
            $this->assertStringContainsString('new code', $e->getMessage());
        }

        $this->assertNotSame(
            'Revised wording.',
            MatatagCompetency::where('learning_area_id', $version->learningAreas->first()->id)
                ->whereNull('parent_id')->orderBy('sort_order')->value('text')
        );
    }

    /**
     * The point of versions: a revision leaves the catalog a school is
     * mid-year on completely untouched, ids included.
     */
    public function test_a_revision_leaves_every_earlier_slot_id_untouched(): void
    {
        $original = $this->version();
        $slotIdsBefore = MatatagCompetencySlot::orderBy('id')->pluck('id')->all();

        $payload = $this->payload();
        $payload['version']['code'] = self::CODE.'-1';
        $payload['version']['title'] = 'DepEd MATATAG Key Stage 1 - Grade 1 (rev 1)';
        $payload['learning_areas'][0]['competencies'][0]['text'] = 'Revised wording.';

        $result = (new CatalogLoader)->load($payload, makeDefault: true);

        $this->assertNotSame($original->id, $result->version->id);
        $this->assertSame(self::TOTAL_SLOTS, $result->slotCount);

        $stillThere = MatatagCompetencySlot::whereIn('id', $slotIdsBefore)->count();
        $this->assertSame(
            count($slotIdsBefore),
            $stillThere,
            'Every slot of the earlier version must survive a revision untouched.'
        );

        $this->assertSame(
            self::TOTAL_SLOTS * 2,
            MatatagCompetencySlot::count(),
            'A revision adds a second catalog; it does not replace the first.'
        );

        // The default moved, but that is all that moved.
        $this->assertSame(
            $result->version->id,
            MatatagGradeLevelCurriculum::find('Grade 1')?->curriculum_version_id
        );
    }

    /**
     * The database-level guarantee, tested directly rather than through the
     * loader — it is the only one that still holds if the application code is
     * wrong.
     */
    public function test_the_database_refuses_to_delete_a_slot_that_has_been_marked(): void
    {
        $slot = MatatagCompetencySlot::first();
        $this->seedRatingFor($slot);

        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::table('matatag_competency_slots')->where('id', $slot->id)->delete();
    }

    /**
     * A revision that *removes* a competency is refused once the competency
     * has been marked. The loader prunes rows the new file no longer mentions;
     * the restrict FK turns that prune into a rolled-back load rather than a
     * silent loss of a term's work.
     */
    public function test_a_revision_that_drops_a_marked_competency_rolls_back(): void
    {
        $version = $this->version();
        $area = $version->learningAreas->firstWhere('key', 'gmrc');
        $competency = MatatagCompetency::where('learning_area_id', $area->id)
            ->where('path', 'T1.1')->firstOrFail();

        $this->seedRatingFor($competency->slots()->first());

        // Unlock, so the refusal under test is the foreign key and not the
        // lock check that would normally catch this first.
        $version->forceFill(['locked_at' => null])->save();

        $payload = $this->payload();

        foreach ($payload['learning_areas'] as $i => $areaPayload) {
            if ($areaPayload['key'] !== 'gmrc') {
                continue;
            }

            $payload['learning_areas'][$i]['competencies'] = array_values(array_filter(
                $areaPayload['competencies'],
                fn ($c) => $c['path'] !== 'T1.1'
            ));
            $payload['learning_areas'][$i]['counts']['competencies'] -= 1;
            $payload['learning_areas'][$i]['counts']['slots'] -= 1;
        }

        $payload['counts']['competencies'] -= 1;
        $payload['counts']['slots'] -= 1;

        try {
            (new CatalogLoader)->load($payload, makeDefault: false, force: true);
            $this->fail('Removing a competency a learner has been marked against must fail.');
        } catch (CatalogLoadException $e) {
            $this->assertStringContainsString('rolled back', $e->getMessage());
        }

        $this->assertSame(
            self::TOTAL_SLOTS,
            MatatagCompetencySlot::count(),
            'Nothing may be lost when the load is refused.'
        );

        $this->assertDatabaseHas('matatag_competencies', ['id' => $competency->id]);
    }

    public function test_a_version_a_section_is_pinned_to_is_not_changed_without_force(): void
    {
        $version = $this->version();
        $this->pinASectionTo($version);

        $payload = $this->payload();
        $payload['learning_areas'][0]['title'] = 'Renamed area';

        try {
            (new CatalogLoader)->load($payload);
            $this->fail('Changing a pinned version without --force must be refused.');
        } catch (CatalogLoadException $e) {
            $this->assertStringContainsString('pinned by 1 section', $e->getMessage());
        }

        $this->assertSame(
            'Reading and Literacy',
            MatatagLearningArea::where('curriculum_version_id', $version->id)
                ->where('key', 'reading-literacy')->value('title')
        );

        // An unchanged re-load of a pinned version is still fine: the guard is
        // about changes, not about the pin.
        $this->assertFalse((new CatalogLoader)->load($this->payload())->changedAnything());
    }

    // -----------------------------------------------------------------

    private function pinASectionTo(MatatagCurriculumVersion $version): MatatagSectionCurriculum
    {
        $institution = Institution::factory()->create();

        $section = ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => 'Grade 1',
            'title' => 'Sampaguita',
            'academic_year' => '2026-2027',
        ]);

        return MatatagSectionCurriculum::create([
            'institution_id' => $institution->id,
            'class_section_id' => $section->id,
            'academic_year' => '2026-2027',
            'curriculum_version_id' => $version->id,
            'grade_level' => 'Grade 1',
            'enabled' => true,
        ]);
    }

    private function seedRatingFor(MatatagCompetencySlot $slot): MatatagCompetencyRating
    {
        $pin = $this->pinASectionTo($this->version());
        $student = Student::create([
            'first_name' => 'Test',
            'last_name' => 'Learner',
            'gender' => 'female',
            'birthdate' => '2020-06-01',
            'is_active' => true,
        ]);

        return MatatagCompetencyRating::create([
            'institution_id' => $pin->institution_id,
            'class_section_id' => $pin->class_section_id,
            'student_id' => $student->id,
            'academic_year' => '2026-2027',
            'slot_id' => $slot->id,
            'term' => $slot->term,
            'learning_area_id' => $slot->learning_area_id,
            'curriculum_version_id' => $pin->curriculum_version_id,
            'descriptor' => 'B',
        ]);
    }
}
