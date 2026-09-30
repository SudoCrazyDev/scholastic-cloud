<?php

namespace Tests\Feature\Matatag;

use App\Models\ClassSection;
use App\Models\MatatagCompetencyRating;
use App\Models\MatatagCompetencySlot;
use App\Models\MatatagCurriculumVersion;
use App\Models\MatatagLearningArea;
use App\Models\MatatagSectionCurriculum;
use App\Models\MatatagTermNarrative;
use App\Models\Student;

/**
 * DepEd's Kindergarten progress report, on the same module as Grade 1's.
 *
 * Kindergarten differs from Grade 1 in exactly the three ways its instrument
 * says — a CO/DV/BG scale, one remarks box per term, and marks printed on the
 * card — and in nothing structural: its catalog is a data file like Grade 1's,
 * and "Kinder 1" and "Kinder 2" both resolve to it.
 */
class MatatagKindergartenTest extends MatatagTestCase
{
    private const KINDER_CODE = 'deped-kindergarten-v1';

    private ClassSection $kinder1;

    private ClassSection $kinder2;

    /** @var array<int, Student> */
    private array $kinderLearners = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->kinder1 = $this->makeSection($this->schoolA, 'Kinder 1', 'Daisy', $this->adviserA1);
        $this->kinder2 = $this->makeSection($this->schoolA, 'Kinder 2', 'Tulip', $this->adviserA2);

        $this->kinderLearners[] = $this->makeLearner($this->schoolA, $this->kinder1, 'Lia', 'Santos', 'female');
        $this->kinderLearners[] = $this->makeLearner($this->schoolA, $this->kinder1, 'Marco', 'Reyes', 'male');
    }

    // -----------------------------------------------------------------
    // The catalog
    // -----------------------------------------------------------------

    public function test_the_kindergarten_catalog_is_loaded_as_its_own_instrument(): void
    {
        $version = $this->kinderCatalog();

        $this->assertSame('Kindergarten', $version->grade_level);
        $this->assertSame('kinder', $version->instrument);
        $this->assertSame(60, $version->competency_count);
        $this->assertSame(180, $version->slot_count, 'Every competency is rated once in every term.');

        $areas = MatatagLearningArea::where('curriculum_version_id', $version->id)
            ->orderBy('sort_order')->get();

        $this->assertSame(
            ['sensory-perceptual-and-motor', 'socio-emotional', 'cognitive', 'language-literacy-and-communication'],
            $areas->pluck('key')->all(),
        );

        foreach ([1, 2, 3] as $term) {
            $this->assertSame(60, MatatagCompetencySlot::whereIn('learning_area_id', $areas->pluck('id'))
                ->where('term', $term)->count(), "term {$term} slots");
        }

        // Grade 1 is untouched: still its own instrument and its own counts.
        $this->assertSame('ks1', $this->catalog()->instrument);
        $this->assertSame(604, $this->catalog()->slot_count);
    }

    // -----------------------------------------------------------------
    // Opting in
    // -----------------------------------------------------------------

    public function test_kinder_1_and_kinder_2_both_opt_in_to_the_kindergarten_catalog(): void
    {
        foreach ([$this->kinder1, $this->kinder2] as $section) {
            $this->as($this->principalA)
                ->postJson("/api/matatag/sections/{$section->id}/opt-in", ['academic_year' => self::YEAR])
                ->assertCreated()
                ->assertJsonPath('data.curriculum_version.code', self::KINDER_CODE)
                ->assertJsonPath('data.curriculum_version.instrument.key', 'kinder')
                ->assertJsonPath('data.grade_level', 'Kindergarten');
        }

        $this->assertSame(2, MatatagSectionCurriculum::where('curriculum_version_id', $this->kinderCatalog()->id)->count());
    }

    public function test_the_section_list_offers_kindergarten_sections_their_own_catalog(): void
    {
        $sections = collect($this->as($this->principalA)
            ->getJson('/api/matatag/sections?academic_year='.self::YEAR)
            ->assertOk()
            ->json('data.sections'));

        $this->assertSame(
            self::KINDER_CODE,
            $sections->firstWhere('title', 'Daisy')['available_curriculum_version']['code'],
        );
        $this->assertSame(
            self::CATALOG_CODE,
            $sections->firstWhere('title', 'Sampaguita')['available_curriculum_version']['code'],
            'A Grade 1 section is still offered Grade 1\'s catalog.',
        );
    }

    public function test_a_grade_1_section_cannot_pin_the_kindergarten_catalog(): void
    {
        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in", [
                'academic_year' => self::YEAR,
                'curriculum_version_id' => $this->kinderCatalog()->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'grade_level_mismatch');
    }

    // -----------------------------------------------------------------
    // Marking
    // -----------------------------------------------------------------

    public function test_the_grid_serves_the_kindergarten_scale(): void
    {
        $this->optIn($this->kinder1, $this->kinderCatalog());

        $response = $this->as($this->adviserA1)
            ->getJson("/api/matatag/grid?class_section_id={$this->kinder1->id}&term=1")
            ->assertOk();

        $this->assertSame(
            ['CO', 'DV', 'BG'],
            array_column($response->json('data.curriculum_version.instrument.descriptors'), 'letter'),
        );
        // One keystroke each, and no two alike.
        $this->assertSame(
            ['C', 'D', 'B'],
            array_column($response->json('data.curriculum_version.instrument.descriptors'), 'key'),
        );
        $this->assertCount(5, $response->json('data.columns'), 'Sensory Perceptual and Motor opens first.');
    }

    public function test_a_kindergarten_learner_is_marked_co_dv_or_bg(): void
    {
        $this->optIn($this->kinder1, $this->kinderCatalog());
        $slots = $this->kinderSlots('cognitive', 1);

        $this->markKinder([
            ['student_id' => $this->kinderLearners[0]->id, 'slot_id' => $slots[0]->id, 'descriptor' => 'CO'],
            ['student_id' => $this->kinderLearners[0]->id, 'slot_id' => $slots[1]->id, 'descriptor' => 'dv'],
            ['student_id' => $this->kinderLearners[1]->id, 'slot_id' => $slots[0]->id, 'descriptor' => 'BG'],
        ])->assertOk()->assertJsonPath('data.written', 3);

        $this->assertSame(
            ['BG', 'CO', 'DV'],
            MatatagCompetencyRating::orderBy('descriptor')->pluck('descriptor')->all(),
            'Two letters are stored whole, upper-cased.',
        );
    }

    public function test_a_grade_1_letter_is_refused_on_a_kindergarten_record_and_the_reverse(): void
    {
        $this->optIn($this->kinder1, $this->kinderCatalog());
        $this->optIn($this->sectionA1);

        $this->markKinder([[
            'student_id' => $this->kinderLearners[0]->id,
            'slot_id' => $this->kinderSlots('cognitive', 1)[0]->id,
            'descriptor' => 'A',
        ]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invalid_descriptor');

        $this->as($this->adviserA1)->postJson('/api/matatag/grid/bulk-upsert', [
            'class_section_id' => $this->sectionA1->id,
            'academic_year' => self::YEAR,
            'term' => 1,
            'ratings' => [[
                'student_id' => $this->learnersA1[0]->id,
                'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
                'descriptor' => 'CO',
            ]],
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invalid_descriptor');

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    // -----------------------------------------------------------------
    // Remarks
    // -----------------------------------------------------------------

    public function test_kindergarten_writes_one_remarks_box_per_term(): void
    {
        $this->optIn($this->kinder1, $this->kinderCatalog());
        $student = $this->kinderLearners[0];

        $this->writeKinderNarratives([[
            'student_id' => $student->id,
            'term' => 1,
            'comments' => 'Joins group play readily; still learning to wait for a turn.',
            // Grade 1's field, which this card has nowhere to print.
            'can_do' => 'Not on this card.',
        ]])->assertOk()->assertJsonPath('data.written', 1);

        $row = MatatagTermNarrative::sole();
        $this->assertSame('Joins group play readily; still learning to wait for a turn.', $row->comments);
        $this->assertNull($row->can_do, 'Another instrument\'s field is ignored, not stored.');

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/narratives?class_section_id={$this->kinder1->id}")
            ->assertOk()
            ->assertJsonPath('data.fields.0.field', 'comments')
            ->assertJsonCount(1, 'data.fields');

        // Clearing the one field this card prints clears the row.
        $this->writeKinderNarratives([['student_id' => $student->id, 'term' => 1, 'comments' => '  ']])
            ->assertOk()
            ->assertJsonPath('data.cleared', 1);

        $this->assertSame(0, MatatagTermNarrative::count());
    }

    // -----------------------------------------------------------------
    // The card
    // -----------------------------------------------------------------

    public function test_the_whole_class_card_carries_every_mark_the_remarks_and_the_scale(): void
    {
        $this->optIn($this->kinder1, $this->kinderCatalog());
        $slot = $this->kinderSlots('language-literacy-and-communication', 2)[0];

        $this->markKinder([[
            'student_id' => $this->kinderLearners[0]->id,
            'slot_id' => $slot->id,
            'descriptor' => 'DV',
        ]], term: 2)->assertOk();

        $this->writeKinderNarratives([[
            'student_id' => $this->kinderLearners[0]->id,
            'term' => 2,
            'comments' => 'Retells a story in order with prompting.',
        ]])->assertOk();

        $data = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->kinder1->id}")
            ->assertOk()
            ->json('data');

        // The marks print on a Kindergarten card, so a whole section still
        // gets them — unlike Grade 1, whose PACE forms are left off.
        $this->assertSame('all_areas', $data['pace']['scope']);
        $this->assertCount(4, $data['pace']['learning_areas']);
        $this->assertSame(60, collect($data['pace']['learning_areas'])->sum(fn ($a) => count($a['rows'])));

        $this->assertSame(['CO', 'DV', 'BG'], array_column($data['legend']['descriptors'], 'letter'));
        $this->assertSame(['comments'], array_column($data['legend']['narratives'], 'field'));
        $this->assertTrue($data['curriculum_version']['instrument']['ratings_on_card']);

        $lia = collect($data['learners'])->firstWhere('student.id', $this->kinderLearners[0]->id);
        $this->assertSame('DV', $lia['pace'][$slot->id]);
        $this->assertSame('Retells a story in order with prompting.', $lia['narratives'][1]['comments']);
    }

    /**
     * The card prints age in years and months. Born 2020-06-15: on 1 June
     * 2026 that is 5 years 11 months, and on 30 April 2027 6 years 10 months.
     */
    public function test_the_card_carries_age_in_years_and_months(): void
    {
        $this->optIn($this->kinder1, $this->kinderCatalog());

        $student = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$this->kinderLearners[0]->id}?class_section_id={$this->kinder1->id}")
            ->assertOk()
            ->json('data.learners.0.student');

        $this->assertSame(5, $student['age_at_start_of_school_year']);
        $this->assertSame(11, $student['age_months_at_start_of_school_year']);
        $this->assertSame(6, $student['age_at_end_of_school_year']);
        $this->assertSame(10, $student['age_months_at_end_of_school_year']);
    }

    // -----------------------------------------------------------------

    private function kinderCatalog(): MatatagCurriculumVersion
    {
        return MatatagCurriculumVersion::where('code', self::KINDER_CODE)->firstOrFail();
    }

    /** @return array<int, MatatagCompetencySlot> */
    private function kinderSlots(string $areaKey, int $term): array
    {
        $area = MatatagLearningArea::where('curriculum_version_id', $this->kinderCatalog()->id)
            ->where('key', $areaKey)->firstOrFail();

        return MatatagCompetencySlot::where('learning_area_id', $area->id)
            ->where('term', $term)->orderBy('sort_order')->get()->all();
    }

    private function markKinder(array $ratings, int $term = 1)
    {
        return $this->as($this->adviserA1)->postJson('/api/matatag/grid/bulk-upsert', [
            'class_section_id' => $this->kinder1->id,
            'academic_year' => self::YEAR,
            'term' => $term,
            'ratings' => $ratings,
        ]);
    }

    private function writeKinderNarratives(array $narratives)
    {
        return $this->as($this->adviserA1)->postJson('/api/matatag/narratives/bulk-upsert', [
            'class_section_id' => $this->kinder1->id,
            'academic_year' => self::YEAR,
            'narratives' => $narratives,
        ]);
    }
}
