<?php

namespace Tests\Feature\Matatag;

use App\Models\MatatagCompetencyRating;
use App\Models\MatatagCompetencySlot;
use App\Models\Student;
use App\Models\StudentSection;
use App\Services\Matatag\CatalogLoader;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * The grid, and the write behind it.
 *
 * `bulkUpsert` is the only way a descriptor is ever recorded — there is no
 * single-cell endpoint, deliberately, because one code path means one set of
 * guards. Everything below is either a guard firing or a teacher working
 * normally.
 */
class MatatagRatingGridTest extends MatatagTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->optIn($this->sectionA1);
    }

    // -----------------------------------------------------------------
    // Reading
    // -----------------------------------------------------------------

    /**
     * The counts are the workbook's, so a catalog that quietly lost a column
     * shows up here as well as in the load test.
     */
    public function test_the_grid_returns_one_column_per_slot_of_the_area_and_term(): void
    {
        $area = $this->area('reading-literacy');

        foreach ([1 => 74, 2 => 76, 3 => 91] as $term => $expected) {
            $response = $this->as($this->adviserA1)->getJson(
                '/api/matatag/grid?class_section_id='.$this->sectionA1->id
                .'&learning_area_id='.$area->id."&term={$term}"
            )->assertOk();

            $this->assertCount($expected, $response->json('data.columns'), "term {$term} columns");
            $this->assertSame($expected, $response->json('data.counts.columns'));
            $this->assertCount(3, $response->json('data.learners'));
        }
    }

    /**
     * Term 1 and Term 3 are different sets of competencies, not the same set
     * with some disabled. "Blocked" is not a property a slot has — a slot
     * simply has no row for a term it is not taught in.
     */
    public function test_a_competency_not_taught_in_a_term_has_no_column_in_it(): void
    {
        $area = $this->area('language');

        $columnsFor = fn (int $term) => collect($this->as($this->adviserA1)->getJson(
            '/api/matatag/grid?class_section_id='.$this->sectionA1->id
            .'&learning_area_id='.$area->id."&term={$term}"
        )->json('data.columns'));

        // Competency 8 is assessed on child a in Terms 1 and 2, and on
        // children b and c in Term 3. This is the pair the extractor used to
        // get wrong, and the grid is where a teacher would have seen it.
        $t1 = $columnsFor(1)->where('number', '8');
        $t3 = $columnsFor(3)->where('number', '8');

        $this->assertSame(['a'], $t1->pluck('letter')->unique()->values()->all());
        $this->assertSame(['b', 'c'], $t3->pluck('letter')->unique()->sort()->values()->all());
    }

    public function test_columns_carry_the_macro_skill_only_where_the_area_uses_one(): void
    {
        $literacy = $this->as($this->adviserA1)->getJson(
            '/api/matatag/grid?class_section_id='.$this->sectionA1->id
            .'&learning_area_id='.$this->area('reading-literacy')->id.'&term=1'
        )->assertOk();

        $this->assertTrue($literacy->json('data.learning_area.uses_macro_skills'));
        $this->assertContains(
            'listening',
            collect($literacy->json('data.columns'))->pluck('macro_skill')->unique()->all(),
        );

        $gmrc = $this->as($this->adviserA1)->getJson(
            '/api/matatag/grid?class_section_id='.$this->sectionA1->id
            .'&learning_area_id='.$this->area('gmrc')->id.'&term=1'
        )->assertOk();

        $this->assertFalse($gmrc->json('data.learning_area.uses_macro_skills'));
        $this->assertSame(
            [null],
            collect($gmrc->json('data.columns'))->pluck('macro_skill')->unique()->all(),
            'An area with no macro skills must not leak the "none" sentinel to the client.',
        );

        $this->assertTrue($gmrc->json('data.learning_area.carries_values'));
        $this->assertNotNull(
            $gmrc->json('data.columns.0.performance_standard'),
            'GMRC prints a performance standard beside each value it cultivates.',
        );
    }

    /** Males first, then females, alphabetical within each — DepEd's order. */
    public function test_learners_come_back_in_the_order_the_form_prints_them(): void
    {
        $names = collect($this->as($this->adviserA1)->getJson(
            '/api/matatag/grid?class_section_id='.$this->sectionA1->id.'&term=1'
        )->json('data.learners'))->pluck('name')->all();

        $this->assertSame(['Ben Cruz', 'Ana Bautista', 'Cara Dizon'], $names);
    }

    /**
     * The screens list a class the way every DepEd form does: surname first,
     * in capitals, with the middle name reduced to an initial.
     *
     * `name` keeps the prose order because the report card is addressed to a
     * parent. Both travel, and the one a screen uses is the screen's choice.
     */
    public function test_each_learner_carries_the_name_as_a_class_record_writes_it(): void
    {
        $this->makeLearner($this->schoolA, $this->sectionA1, 'Juan', 'Santos', 'male', 'Pineda', 'Jr.');

        $learners = collect($this->as($this->adviserA1)->getJson(
            '/api/matatag/grid?class_section_id='.$this->sectionA1->id.'&term=1'
        )->json('data.learners'));

        $this->assertSame(
            ['CRUZ, BEN', 'SANTOS, JUAN P. JR.', 'BAUTISTA, ANA', 'DIZON, CARA'],
            $learners->pluck('display_name')->all(),
        );

        // The suffix trails the given names, matching what the Students tab of
        // the same screen already prints. And the prose name is untouched,
        // because the report card is addressed to a parent.
        $this->assertSame(
            'Juan Pineda Santos Jr.',
            $learners->firstWhere('display_name', 'SANTOS, JUAN P. JR.')['name'],
        );
    }

    /** A blank middle name must not leave a stray initial or a lone comma. */
    public function test_a_learner_with_no_middle_name_gets_no_initial(): void
    {
        $narratives = $this->as($this->adviserA1)->getJson(
            '/api/matatag/narratives?class_section_id='.$this->sectionA1->id
        );

        $this->assertSame(
            ['CRUZ, BEN', 'BAUTISTA, ANA', 'DIZON, CARA'],
            collect($narratives->json('data.learners'))->pluck('display_name')->all(),
            'The narratives screen lists the same class in the same order and spelling.',
        );
    }

    // -----------------------------------------------------------------
    // Writing
    // -----------------------------------------------------------------

    public function test_a_whole_column_writes_in_one_request_and_is_idempotent(): void
    {
        $slot = $this->slotsFor('gmrc', 1)[0];

        $payload = [
            'class_section_id' => $this->sectionA1->id,
            'term' => 1,
            'academic_year' => self::YEAR,
            'ratings' => array_map(fn (Student $s) => [
                'student_id' => $s->id,
                'slot_id' => $slot->id,
                'descriptor' => 'B',
            ], $this->learnersA1),
        ];

        $this->as($this->adviserA1)
            ->postJson('/api/matatag/grid/bulk-upsert', $payload)
            ->assertOk()
            ->assertJsonPath('data.written', 3);

        $this->assertSame(3, MatatagCompetencyRating::count());

        // A teacher who double-clicks Save writes the same column twice.
        $this->as($this->adviserA1)
            ->postJson('/api/matatag/grid/bulk-upsert', $payload)
            ->assertOk();

        $this->assertSame(3, MatatagCompetencyRating::count(), 'Saving twice must not duplicate.');

        $rating = MatatagCompetencyRating::first();
        $this->assertSame($this->schoolA->id, $rating->institution_id);
        $this->assertSame($this->catalog()->id, $rating->curriculum_version_id);
        $this->assertSame($slot->learning_area_id, $rating->learning_area_id);
        $this->assertSame(1, $rating->term);
        $this->assertSame($this->adviserA1->id, $rating->marked_by);
    }

    /** The same cell named twice in one payload must reach the database once. */
    public function test_a_payload_that_names_one_cell_twice_is_not_rejected_by_the_database(): void
    {
        $slot = $this->slotsFor('gmrc', 1)[0];
        $student = $this->learnersA1[0];

        $this->as($this->adviserA1)
            ->postJson('/api/matatag/grid/bulk-upsert', [
                'class_section_id' => $this->sectionA1->id,
                'term' => 1,
                'ratings' => [
                    ['student_id' => $student->id, 'slot_id' => $slot->id, 'descriptor' => 'C'],
                    ['student_id' => $student->id, 'slot_id' => $slot->id, 'descriptor' => 'A'],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.written', 1);

        $this->assertSame('A', MatatagCompetencyRating::first()->descriptor, 'the last one wins');
    }

    /**
     * Clearing deletes the row. There is no "no mark" sentinel, and no
     * SoftDeletes — a trashed row would keep occupying the unique slot and
     * silently block the teacher from re-marking that cell.
     */
    public function test_a_null_descriptor_clears_the_cell(): void
    {
        $slot = $this->slotsFor('gmrc', 1)[0];
        $student = $this->learnersA1[0];

        $this->write([['student_id' => $student->id, 'slot_id' => $slot->id, 'descriptor' => 'D']])
            ->assertOk();
        $this->assertSame(1, MatatagCompetencyRating::count());

        $this->write([['student_id' => $student->id, 'slot_id' => $slot->id, 'descriptor' => null]])
            ->assertOk()
            ->assertJsonPath('data.cleared', 1);

        $this->assertSame(0, MatatagCompetencyRating::count());

        // And the cell can be marked again afterwards.
        $this->write([['student_id' => $student->id, 'slot_id' => $slot->id, 'descriptor' => 'A']])
            ->assertOk();
        $this->assertSame(1, MatatagCompetencyRating::count());
    }

    public function test_the_first_descriptor_locks_the_catalog(): void
    {
        $this->assertNull($this->catalog()->locked_at);

        $this->write([[
            'student_id' => $this->learnersA1[0]->id,
            'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
            'descriptor' => 'B',
        ]])->assertOk();

        $this->assertNotNull(
            $this->catalog()->locked_at,
            'A catalog becomes history the moment a child is marked against it.',
        );
    }

    // -----------------------------------------------------------------
    // The guards
    // -----------------------------------------------------------------

    public function test_a_slot_from_another_term_is_refused(): void
    {
        $term3Slot = $this->slotsFor('gmrc', 3)[0];

        $this->as($this->adviserA1)
            ->postJson('/api/matatag/grid/bulk-upsert', [
                'class_section_id' => $this->sectionA1->id,
                'term' => 1,
                'ratings' => [[
                    'student_id' => $this->learnersA1[0]->id,
                    'slot_id' => $term3Slot->id,
                    'descriptor' => 'A',
                ]],
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'slot_term_mismatch');

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    public function test_a_slot_from_another_curriculum_version_is_refused(): void
    {
        $payload = CatalogLoader::decodeFile(database_path('data/matatag/grade-1.v1.json'));
        $payload['version']['code'] = 'other-catalog';
        $other = (new CatalogLoader)->load($payload)->version;

        $foreignSlot = MatatagCompetencySlot::whereIn(
            'learning_area_id',
            \App\Models\MatatagLearningArea::where('curriculum_version_id', $other->id)->select('id')
        )->where('term', 1)->firstOrFail();

        $this->write([[
            'student_id' => $this->learnersA1[0]->id,
            'slot_id' => $foreignSlot->id,
            'descriptor' => 'A',
        ]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'slot_not_in_curriculum');

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    /**
     * The cross-tenant guard on the write path, and the one that matters most:
     * the row would carry *this* section's institution_id, so nothing
     * downstream would ever look wrong.
     */
    public function test_a_learner_from_another_school_cannot_be_marked(): void
    {
        $this->write([[
            'student_id' => $this->learnerB->id,
            'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
            'descriptor' => 'A',
        ]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'student_not_on_roster');

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    public function test_a_learner_who_has_left_the_section_cannot_be_marked(): void
    {
        $left = $this->learnersA1[2];

        StudentSection::where('student_id', $left->id)
            ->where('section_id', $this->sectionA1->id)
            ->update(['is_active' => false]);

        $this->write([[
            'student_id' => $left->id,
            'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
            'descriptor' => 'A',
        ]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'student_not_on_roster');
    }

    /**
     * There are no numbers in this instrument. A client that sends one is
     * either broken or pointed at the wrong module.
     */
    #[DataProvider('badDescriptors')]
    public function test_a_descriptor_that_is_not_one_of_deped_five_letters_is_refused(mixed $descriptor): void
    {
        $this->write([[
            'student_id' => $this->learnersA1[0]->id,
            'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
            'descriptor' => $descriptor,
        ]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invalid_descriptor');

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    public static function badDescriptors(): array
    {
        return [
            'a letter past E' => ['F'],
            'a numeric grade' => ['1'],
            'a transmuted score' => ['85'],
            'outstanding, from the core values scale' => ['AO'],
        ];
    }

    public function test_a_lowercase_descriptor_is_accepted_and_stored_uppercase(): void
    {
        $this->write([[
            'student_id' => $this->learnersA1[0]->id,
            'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
            'descriptor' => 'b',
        ]])->assertOk();

        $this->assertSame('B', MatatagCompetencyRating::first()->descriptor);
    }

    public function test_writing_to_a_section_that_has_opted_out_is_refused(): void
    {
        $this->as($this->principalA)
            ->deleteJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertOk();

        $this->write([[
            'student_id' => $this->learnersA1[0]->id,
            'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
            'descriptor' => 'A',
        ]])
            ->assertStatus(409)
            ->assertJsonPath('code', 'not_opted_in');
    }

    /**
     * A retained learner re-sits the same slots next year. Without the
     * academic year in the unique key the new mark would overwrite last year's
     * record.
     */
    public function test_a_retained_learner_re_sits_the_same_slots_next_year(): void
    {
        $student = $this->learnersA1[0];
        $slot = $this->slotsFor('gmrc', 1)[0];

        $this->write([['student_id' => $student->id, 'slot_id' => $slot->id, 'descriptor' => 'D']])
            ->assertOk();

        // A second year on the same section, same catalog.
        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $this->sectionA1->id,
            'academic_year' => '2027-2028',
            'is_active' => true,
        ]);

        $this->optIn($this->sectionA1)->replicate()->fill([
            'academic_year' => '2027-2028',
        ])->save();

        $this->as($this->adviserA1)->postJson('/api/matatag/grid/bulk-upsert', [
            'class_section_id' => $this->sectionA1->id,
            'term' => 1,
            'academic_year' => '2027-2028',
            'ratings' => [['student_id' => $student->id, 'slot_id' => $slot->id, 'descriptor' => 'B']],
        ])->assertOk();

        $this->assertSame(2, MatatagCompetencyRating::where('student_id', $student->id)->count());
        $this->assertSame('D', MatatagCompetencyRating::where('academic_year', self::YEAR)->value('descriptor'));
        $this->assertSame('B', MatatagCompetencyRating::where('academic_year', '2027-2028')->value('descriptor'));
    }

    public function test_recorded_descriptors_come_back_keyed_for_the_grid(): void
    {
        $slot = $this->slotsFor('gmrc', 1)[0];
        $student = $this->learnersA1[0];

        $this->write([['student_id' => $student->id, 'slot_id' => $slot->id, 'descriptor' => 'C']])
            ->assertOk();

        $this->as($this->adviserA1)
            ->getJson('/api/matatag/grid?class_section_id='.$this->sectionA1->id
                .'&learning_area_id='.$this->area('gmrc')->id.'&term=1')
            ->assertOk()
            ->assertJsonPath("data.ratings.{$student->id}:{$slot->id}", 'C')
            ->assertJsonPath('data.counts.recorded', 1);
    }

    public function test_an_empty_save_is_accepted_and_writes_nothing(): void
    {
        $this->write([])->assertOk()->assertJsonPath('data.written', 0);

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    // -----------------------------------------------------------------

    private function write(array $ratings)
    {
        return $this->as($this->adviserA1)->postJson('/api/matatag/grid/bulk-upsert', [
            'class_section_id' => $this->sectionA1->id,
            'term' => 1,
            'academic_year' => self::YEAR,
            'ratings' => $ratings,
        ]);
    }
}
