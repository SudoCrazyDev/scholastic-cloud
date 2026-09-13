<?php

namespace Tests\Feature\Matatag;

use App\Models\ClassSection;
use App\Models\MatatagCompetencyRating;
use App\Models\MatatagTermNarrative;
use App\Models\Student;
use App\Models\StudentAttendance;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use Illuminate\Support\Str;

/**
 * The report card and the PACE forms behind it.
 *
 * The most important test in this file is the one that asserts an *absence*.
 * Everything else about MATATAG can be got right and the instrument still
 * broken by one helpful `average` key appearing somewhere in the payload,
 * because the moment the shape can express a number, something downstream will
 * print one. So the no-numbers rule is checked structurally over the whole
 * response rather than by reading the composer and trusting it.
 */
class MatatagProgressReportTest extends MatatagTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->optIn($this->sectionA1);
    }

    // -----------------------------------------------------------------
    // The shape is the model
    // -----------------------------------------------------------------

    /**
     * No key anywhere in the response may name a number this instrument does
     * not have.
     *
     * DepEd's Key Stage 1 workbook contains no score, no weight, no average, no
     * transmutation and no general average, and neither does this payload — not
     * as null, not as zero, not as "pending". A field that exists eventually
     * gets filled in.
     */
    public function test_no_key_anywhere_in_the_report_is_an_average_or_a_final_grade(): void
    {
        $this->markEveryLearner();
        $this->writeNarrative($this->learnersA1[0]->id, 1);

        $urls = [
            "/api/matatag/progress-report?class_section_id={$this->sectionA1->id}",
            "/api/matatag/progress-report?class_section_id={$this->sectionA1->id}"
                .'&learning_area_id='.$this->area('gmrc')->id,
            "/api/matatag/progress-report/{$this->learnersA1[0]->id}"
                ."?class_section_id={$this->sectionA1->id}",
        ];

        foreach ($urls as $url) {
            $payload = $this->as($this->adviserA1)->getJson($url)->assertOk()->json('data');

            $offenders = $this->keysMatching($payload, '/average|final_grade|transmuted|grade$|^score|percentage|weight|rating$|remarks$/i');

            $this->assertSame(
                [],
                $offenders,
                "{$url} carries a key this instrument has no number for: ".implode(', ', $offenders),
            );
        }
    }

    /**
     * The card's body is narratives, attendance and the legend. The descriptor
     * grid is not on the card — it prints on the attached PACE forms — so it
     * appears under `pace` and nowhere else.
     */
    public function test_the_card_is_narratives_attendance_and_a_legend_and_the_grid_is_only_under_pace(): void
    {
        $this->markEveryLearner();

        $data = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$this->learnersA1[0]->id}"
                ."?class_section_id={$this->sectionA1->id}")
            ->assertOk()
            ->json('data');

        $learner = $data['learners'][0];

        $this->assertSame(
            ['student', 'narratives', 'attendance', 'pace'],
            array_keys($learner),
        );

        $this->assertArrayHasKey('descriptors', $data['legend']);
        $this->assertCount(5, $data['legend']['descriptors']);

        // Descriptors live under the learner's `pace` map and the competency
        // text lives under the top-level `pace` catalog. Neither appears in the
        // card's own body.
        $this->assertNotEmpty($learner['pace']);
        $this->assertArrayNotHasKey('ratings', $learner);
        $this->assertArrayNotHasKey('columns', $data);
        $this->assertArrayNotHasKey('ratings', $data);
    }

    // -----------------------------------------------------------------
    // The catalog is hoisted
    // -----------------------------------------------------------------

    /**
     * Competency text is emitted once for the whole section, not once per
     * learner. On a 50-learner section that is the difference between a few
     * hundred kilobytes and several megabytes.
     */
    public function test_the_catalog_is_hoisted_and_never_repeated_per_learner(): void
    {
        $this->markEveryLearner();

        $data = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA1->id}"
                .'&learning_area_id='.$this->area('gmrc')->id)
            ->assertOk()
            ->json('data');

        $this->assertCount(3, $data['learners']);
        $this->assertCount(1, $data['pace']['learning_areas']);
        $this->assertNotEmpty($data['pace']['learning_areas'][0]['rows']);

        foreach ($data['learners'] as $learner) {
            // A flat slot_id => letter map; no text, no nesting, no catalog.
            foreach ($learner['pace'] as $slotId => $descriptor) {
                $this->assertTrue(Str::isUuid($slotId));
                $this->assertContains($descriptor, ['A', 'B', 'C', 'D', 'E']);
            }
        }

        // Nothing from the catalog is repeated inside a learner. Asserted by
        // the absence of the catalog's own keys rather than by counting
        // occurrences of a competency's text, because that text is not unique —
        // a per-term area restarts its numbering each term and DepEd repeats
        // values across them.
        $this->assertSame(
            [],
            $this->keysMatching($data['learners'], '/^(text|path|performance_standard|rows|domains|competency_id|macro_skill)$/'),
        );
    }

    /**
     * A whole section's forms across all five areas is 50 × 604 descriptors and
     * 600 printed pages. It is not served by accident — and the caller is told
     * so rather than left to wonder where the forms went.
     */
    public function test_a_whole_section_gets_cards_without_pace_forms_and_is_told_why(): void
    {
        $data = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA1->id}")
            ->assertOk()
            ->json('data');

        $this->assertSame('omitted', $data['pace']['scope']);
        $this->assertSame([], $data['pace']['learning_areas']);
        $this->assertNotNull($data['pace']['note']);
        $this->assertCount(3, $data['learners']);
    }

    public function test_one_learner_gets_every_pace_form(): void
    {
        $data = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$this->learnersA1[0]->id}"
                ."?class_section_id={$this->sectionA1->id}")
            ->assertOk()
            ->json('data');

        $this->assertSame('all_areas', $data['pace']['scope']);
        $this->assertCount(5, $data['pace']['learning_areas']);
        $this->assertCount(1, $data['learners']);

        $keys = array_column($data['pace']['learning_areas'], 'key');
        $this->assertSame(
            ['reading-literacy', 'language', 'mathematics', 'gmrc', 'makabansa'],
            $keys,
        );
    }

    /**
     * A PACE row is a competency across the whole year, carrying one box per
     * (term, macro skill) it is actually assessed in. The entry grid is the
     * same catalog turned ninety degrees, so the two must agree: every slot the
     * grid shows for a term appears on exactly one row of the form.
     */
    public function test_every_slot_the_grid_shows_appears_on_exactly_one_pace_row(): void
    {
        $data = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$this->learnersA1[0]->id}"
                ."?class_section_id={$this->sectionA1->id}")
            ->assertOk()
            ->json('data');

        foreach ($data['pace']['learning_areas'] as $area) {
            $onForm = [];

            foreach ($area['rows'] as $row) {
                foreach ($row['slots'] as $slot) {
                    $this->assertArrayNotHasKey($slot['id'], $onForm, 'a slot printed twice');
                    $onForm[$slot['id']] = $slot['term'];
                }
            }

            foreach ([1, 2, 3] as $term) {
                foreach ($this->slotsFor($area['key'], $term) as $slot) {
                    $this->assertArrayHasKey(
                        $slot->id,
                        $onForm,
                        "{$area['key']} term {$term} has a slot the PACE form never prints",
                    );
                    $this->assertSame($term, $onForm[$slot->id]);
                }
            }
        }
    }

    /**
     * GMRC's two Filipino fields reach the form: the value cultivated is the
     * competency's own text, and the performance standard rides beside it.
     * Every other area leaves the standard null.
     */
    public function test_gmrc_carries_its_value_and_its_performance_standard(): void
    {
        $data = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$this->learnersA1[0]->id}"
                ."?class_section_id={$this->sectionA1->id}")
            ->assertOk()
            ->json('data');

        $areas = collect($data['pace']['learning_areas'])->keyBy('key');

        $gmrc = $areas['gmrc']['rows'][0];
        $this->assertTrue($areas['gmrc']['carries_values']);
        $this->assertNotEmpty($gmrc['performance_standard']);
        $this->assertNotEmpty($gmrc['text']);

        $this->assertNull($areas['mathematics']['rows'][0]['performance_standard']);
    }

    // -----------------------------------------------------------------
    // The card itself
    // -----------------------------------------------------------------

    /**
     * Ages come off the school year's own month rows, never off `now()` —
     * `config/app.php` hardcodes UTC while the schools are in Asia/Manila, and
     * a learner's printed age is not a thing to be eight hours wrong about.
     */
    public function test_ages_are_computed_from_the_school_years_own_bounds(): void
    {
        // 2026-2027 runs June 2026 to April 2027. A learner born 15 June 2020
        // is 5 on 1 June 2026 (birthday not yet reached) and 6 on 30 April 2027.
        $data = $this->cardFor($this->learnersA1[0]);
        $this->assertSame(5, $data['learners'][0]['student']['age_at_start_of_school_year']);
        $this->assertSame(6, $data['learners'][0]['student']['age_at_end_of_school_year']);

        // Born on the first day of the year: already 6 at the start, 7 by April.
        $this->learnersA1[1]->update(['birthdate' => '2020-06-01']);
        $data = $this->cardFor($this->learnersA1[1]);
        $this->assertSame(6, $data['learners'][0]['student']['age_at_start_of_school_year']);
        $this->assertSame(6, $data['learners'][0]['student']['age_at_end_of_school_year']);

        // And the boundary the other way: a birthday on the last printed day.
        $this->learnersA1[2]->update(['birthdate' => '2020-04-30']);
        $data = $this->cardFor($this->learnersA1[2]);
        $this->assertSame(6, $data['learners'][0]['student']['age_at_start_of_school_year']);
        $this->assertSame(7, $data['learners'][0]['student']['age_at_end_of_school_year']);
    }

    /**
     * The card prints three narrative blocks whether or not the adviser has
     * written them. A blank Term 2 in December is a meaningful thing for a
     * parent to see; omitting it would make the renderer guess.
     */
    public function test_all_three_terms_print_whether_written_or_not(): void
    {
        $this->writeNarrative($this->learnersA1[0]->id, 2, 'Reads aloud with confidence.', 'Blending.');

        $data = $this->cardFor($this->learnersA1[0]);
        $narratives = $data['learners'][0]['narratives'];

        $this->assertCount(3, $narratives);
        $this->assertSame([1, 2, 3], array_column($narratives, 'term'));

        $this->assertNull($narratives[0]['can_do']);
        $this->assertSame('Reads aloud with confidence.', $narratives[1]['can_do']);
        $this->assertSame('Blending.', $narratives[1]['to_improve']);
        $this->assertNull($narratives[2]['to_improve']);
    }

    /**
     * Attendance is the same derivation the read-only panel shows, and the
     * annual total is the three terms added up. Those two cannot be allowed to
     * disagree on a printed form.
     */
    public function test_the_attendance_block_reconciles_term_by_term(): void
    {
        StudentAttendance::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA1->id,
            'student_id' => $this->learnersA1[0]->id,
            'academic_year' => self::YEAR,
            'month' => 6,
            'year' => 2026,
            'days_present' => 18,
            'days_absent' => 2,
        ]);

        StudentAttendance::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA1->id,
            'student_id' => $this->learnersA1[0]->id,
            'academic_year' => self::YEAR,
            'month' => 11,
            'year' => 2026,
            'days_present' => 20,
            'days_absent' => 0,
        ]);

        $attendance = $this->cardFor($this->learnersA1[0])['learners'][0]['attendance'];

        $this->assertCount(11, $attendance['months']);
        $this->assertSame(18, $attendance['terms']['1']['days_present']);
        $this->assertSame(2, $attendance['terms']['1']['days_absent']);
        $this->assertSame(20, $attendance['terms']['2']['days_present']);
        $this->assertSame(0, $attendance['terms']['3']['days_present']);

        $this->assertSame(38, $attendance['total']['days_present']);
        $this->assertSame(2, $attendance['total']['days_absent']);

        $sum = array_sum(array_column(array_values($attendance['terms']), 'days_present'));
        $this->assertSame($attendance['total']['days_present'], $sum);
    }

    public function test_the_card_names_the_school_the_section_and_the_catalog(): void
    {
        $this->schoolA->update([
            'division' => 'Davao City',
            'region' => 'Region XI',
            'gov_id' => '123456',
        ]);

        $data = $this->cardFor($this->learnersA1[0]);

        $this->assertSame('School A', $data['school']['name']);
        $this->assertSame('Davao City', $data['school']['division']);
        $this->assertSame('Region XI', $data['school']['region']);
        $this->assertSame('123456', $data['school']['school_id']);

        $this->assertSame('Sampaguita', $data['section']['title']);
        $this->assertSame('Grade 1', $data['section']['grade_level']);
        $this->assertSame($this->adviserA1->id, $data['section']['adviser']['id']);

        $this->assertSame(self::CATALOG_CODE, $data['curriculum_version']['code']);
        $this->assertSame(self::YEAR, $data['academic_year']);
    }

    // -----------------------------------------------------------------
    // Scoping
    // -----------------------------------------------------------------

    /**
     * The marks belong to the learner, not to the section they sat in when they
     * were made. A child who moves from Rosal to Sampaguita in October must not
     * have Term 1 silently missing from their own report card.
     */
    public function test_descriptors_follow_a_learner_who_moved_section_mid_year(): void
    {
        $slotInRosal = $this->slotsFor('gmrc', 1)[0];
        $learner = $this->learnersA1[0];

        // Marked while the learner was in the other Grade 1 section.
        MatatagCompetencyRating::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA2->id,
            'student_id' => $learner->id,
            'academic_year' => self::YEAR,
            'slot_id' => $slotInRosal->id,
            'term' => 1,
            'learning_area_id' => $slotInRosal->learning_area_id,
            'curriculum_version_id' => $this->catalog()->id,
            'descriptor' => 'B',
            'marked_by' => $this->adviserA2->id,
            'marked_at' => now(),
        ]);

        $data = $this->cardFor($learner);

        $this->assertSame('B', $data['learners'][0]['pace'][$slotInRosal->id]);
    }

    /**
     * ...but only within the school. A child who transferred in from School B
     * in October leaves a term of descriptors behind them there, and School A's
     * DepEd form must print School A's record — marked against School A's
     * pinned catalog by School A's adviser — and nothing else.
     *
     * This is the hazard `InstitutionCleanupGroups` records against
     * `core_value_markings`, avoided by scoping the read on `institution_id`
     * rather than on the learner alone.
     */
    public function test_another_schools_descriptors_never_reach_this_card(): void
    {
        $learner = $this->learnersA1[0];

        // Where the child came from. The enrolment is closed; the marks remain.
        StudentInstitution::create([
            'student_id' => $learner->id,
            'institution_id' => $this->schoolB->id,
            'is_active' => false,
        ]);

        $atA = $this->slotsFor('gmrc', 1)[0];
        $atB = $this->slotsFor('gmrc', 1)[1];

        foreach ([[$this->schoolA, $this->sectionA1, $atA, 'A'], [$this->schoolB, $this->sectionB1, $atB, 'E']] as [$school, $section, $slot, $letter]) {
            MatatagCompetencyRating::create([
                'institution_id' => $school->id,
                'class_section_id' => $section->id,
                'student_id' => $learner->id,
                'academic_year' => self::YEAR,
                'slot_id' => $slot->id,
                'term' => 1,
                'learning_area_id' => $slot->learning_area_id,
                'curriculum_version_id' => $this->catalog()->id,
                'descriptor' => $letter,
                'marked_by' => $this->principalA->id,
                'marked_at' => now(),
            ]);
        }

        $pace = $this->cardFor($learner)['learners'][0]['pace'];

        $this->assertSame('A', $pace[$atA->id]);
        $this->assertArrayNotHasKey($atB->id, $pace, "School B's descriptor reached School A's card");
    }

    /**
     * A student id in a URL proves nothing about who may read it. The only
     * thing that does is being on a roster the caller has already been cleared
     * for — which is why the roster is filtered rather than the student
     * fetched.
     */
    public function test_a_learner_from_another_section_is_not_found(): void
    {
        $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$this->learnerB->id}"
                ."?class_section_id={$this->sectionA1->id}")
            ->assertNotFound()
            ->assertJsonFragment(['code' => 'student_not_on_roster']);

        $stranger = Student::create([
            'first_name' => 'Nobody',
            'last_name' => 'Here',
            'gender' => 'male',
            'birthdate' => '2020-01-01',
            'is_active' => true,
        ]);

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$stranger->id}"
                ."?class_section_id={$this->sectionA1->id}")
            ->assertNotFound();
    }

    public function test_a_section_that_is_not_reporting_on_matatag_has_no_card_to_print(): void
    {
        $this->as($this->adviserA2)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA2->id}")
            ->assertStatus(409)
            ->assertJsonFragment(['code' => 'not_opted_in']);
    }

    public function test_a_learning_area_from_another_catalog_is_refused(): void
    {
        $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA1->id}"
                .'&learning_area_id='.Str::uuid7())
            ->assertNotFound()
            ->assertJsonFragment(['code' => 'area_not_in_curriculum']);
    }

    /**
     * A learner who left the section is off the roster and off the printout.
     */
    public function test_an_inactive_enrolment_is_not_printed(): void
    {
        StudentSection::where('student_id', $this->learnersA1[1]->id)
            ->where('section_id', $this->sectionA1->id)
            ->update(['is_active' => false]);

        $data = $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA1->id}")
            ->assertOk()
            ->json('data');

        $this->assertCount(2, $data['learners']);
        $this->assertNotContains(
            $this->learnersA1[1]->id,
            array_column(array_column($data['learners'], 'student'), 'id'),
        );
    }

    /**
     * The report is a read. It must leave nothing behind — not a rating, not a
     * narrative, not a stamped `locked_at`.
     */
    public function test_printing_writes_nothing(): void
    {
        $this->markEveryLearner();

        $before = [
            MatatagCompetencyRating::count(),
            MatatagTermNarrative::count(),
            $this->catalog()->fresh()->locked_at?->toIso8601String(),
        ];

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA1->id}")
            ->assertOk();

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$this->learnersA1[0]->id}"
                ."?class_section_id={$this->sectionA1->id}")
            ->assertOk();

        $this->assertSame($before, [
            MatatagCompetencyRating::count(),
            MatatagTermNarrative::count(),
            $this->catalog()->fresh()->locked_at?->toIso8601String(),
        ]);
    }

    /**
     * A principal with `view-all` prints any section's cards; an adviser
     * without it prints only their own. Printing is reading, so `view` is
     * enough for both — a curriculum head who may not mark may still print.
     */
    public function test_reach_follows_view_all_and_printing_needs_no_manage(): void
    {
        $this->optIn($this->sectionA2);

        $this->as($this->principalA)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA2->id}")
            ->assertOk();

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA2->id}")
            ->assertForbidden();

        $this->revoke($this->principalA, 'matatag-grading.manage');

        $this->as($this->principalA)
            ->getJson("/api/matatag/progress-report?class_section_id={$this->sectionA1->id}")
            ->assertOk();
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    private function cardFor(Student $student): array
    {
        return $this->as($this->adviserA1)
            ->getJson("/api/matatag/progress-report/{$student->id}"
                ."?class_section_id={$this->sectionA1->id}")
            ->assertOk()
            ->json('data');
    }

    /** One GMRC descriptor each, so a report has something to print. */
    private function markEveryLearner(): void
    {
        $slot = $this->slotsFor('gmrc', 1)[0];

        foreach ($this->learnersA1 as $index => $learner) {
            MatatagCompetencyRating::create([
                'institution_id' => $this->schoolA->id,
                'class_section_id' => $this->sectionA1->id,
                'student_id' => $learner->id,
                'academic_year' => self::YEAR,
                'slot_id' => $slot->id,
                'term' => 1,
                'learning_area_id' => $slot->learning_area_id,
                'curriculum_version_id' => $this->catalog()->id,
                'descriptor' => ['A', 'B', 'C'][$index % 3],
                'marked_by' => $this->adviserA1->id,
                'marked_at' => now(),
            ]);
        }
    }

    private function writeNarrative(
        string $studentId,
        int $term,
        string $canDo = 'Knows every letter sound.',
        string $toImprove = 'Holding a pencil.',
        ?ClassSection $section = null,
    ): void {
        MatatagTermNarrative::create([
            'institution_id' => ($section ?? $this->sectionA1)->institution_id,
            'class_section_id' => ($section ?? $this->sectionA1)->id,
            'student_id' => $studentId,
            'academic_year' => self::YEAR,
            'term' => $term,
            'can_do' => $canDo,
            'to_improve' => $toImprove,
            'written_by' => $this->adviserA1->id,
        ]);
    }

    /**
     * Every key anywhere in a nested payload that matches a pattern.
     *
     * Walks the whole structure rather than checking the top level, because the
     * key that would do the damage is the one nobody thought to look at — three
     * levels down, inside one learner, on one area.
     *
     * @return array<int, string>
     */
    private function keysMatching(mixed $node, string $pattern, string $path = ''): array
    {
        if (! is_array($node)) {
            return [];
        }

        $found = [];

        foreach ($node as $key => $value) {
            $here = $path === '' ? (string) $key : $path.'.'.$key;

            if (is_string($key) && preg_match($pattern, $key)) {
                $found[] = $here;
            }

            $found = array_merge($found, $this->keysMatching($value, $pattern, $here));
        }

        return $found;
    }
}
