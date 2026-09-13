<?php

namespace Tests\Feature\Matatag;

use App\Http\Controllers\MatatagNarrativeController;
use App\Models\MatatagTermNarrative;

/**
 * The two paragraphs that are the progress report card.
 *
 * Everything else on the card is derived — attendance from the platform's own
 * records, the legend from config — and the competency grid prints on the
 * attached PACE forms. What a parent actually sits down and reads is these.
 */
class MatatagNarrativeTest extends MatatagTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->optIn($this->sectionA1);
    }

    public function test_narratives_are_written_per_learner_per_term(): void
    {
        $student = $this->learnersA1[0];

        $this->write([[
            'student_id' => $student->id,
            'term' => 1,
            'can_do' => 'Reads aloud with growing confidence and joins in class discussions.',
            'to_improve' => 'Forming letters evenly when copying from the board.',
        ]])->assertOk()->assertJsonPath('data.written', 1);

        $this->assertDatabaseHas('matatag_term_narratives', [
            'student_id' => $student->id,
            'academic_year' => self::YEAR,
            'term' => 1,
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA1->id,
            'written_by' => $this->adviserA1->id,
        ]);

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/narratives?class_section_id={$this->sectionA1->id}&term=1")
            ->assertOk()
            ->assertJsonPath("data.narratives.{$student->id}:1.to_improve",
                'Forming letters evenly when copying from the board.')
            ->assertJsonPath('data.max_length', MatatagNarrativeController::MAX_LENGTH);
    }

    public function test_writing_the_same_learner_and_term_again_replaces_rather_than_duplicates(): void
    {
        $student = $this->learnersA1[0];

        $this->write([['student_id' => $student->id, 'term' => 1, 'can_do' => 'First draft.']])->assertOk();
        $this->write([['student_id' => $student->id, 'term' => 1, 'can_do' => 'Second draft.']])->assertOk();

        $this->assertSame(1, MatatagTermNarrative::count(),
            'Two rows would mean two report cards for one learner-term, with nothing to say which '
            .'one a parent should have been given.');
        $this->assertSame('Second draft.', MatatagTermNarrative::first()->can_do);
    }

    public function test_the_three_terms_are_kept_apart(): void
    {
        $student = $this->learnersA1[0];

        foreach ([1, 2, 3] as $term) {
            $this->write([['student_id' => $student->id, 'term' => $term, 'can_do' => "Term {$term}."]])
                ->assertOk();
        }

        $this->assertSame(3, MatatagTermNarrative::count());

        // No term named: the report card prints all three at once.
        $all = $this->as($this->adviserA1)
            ->getJson("/api/matatag/narratives?class_section_id={$this->sectionA1->id}")
            ->assertOk()
            ->json('data.narratives');

        $this->assertSame('Term 2.', $all["{$student->id}:2"]['can_do']);
        $this->assertCount(3, $all);
    }

    /** Emptying both fields deletes the row, so "written up yet?" stays answerable. */
    public function test_clearing_both_fields_deletes_the_row(): void
    {
        $student = $this->learnersA1[0];

        $this->write([['student_id' => $student->id, 'term' => 1, 'can_do' => 'Something.']])->assertOk();
        $this->assertSame(1, MatatagTermNarrative::count());

        $this->write([['student_id' => $student->id, 'term' => 1, 'can_do' => '   ', 'to_improve' => null]])
            ->assertOk()
            ->assertJsonPath('data.cleared', 1);

        $this->assertSame(0, MatatagTermNarrative::count());
    }

    public function test_text_beyond_the_cap_is_refused(): void
    {
        $this->write([[
            'student_id' => $this->learnersA1[0]->id,
            'term' => 1,
            'can_do' => str_repeat('a', MatatagNarrativeController::MAX_LENGTH + 1),
        ]])->assertStatus(422);

        $this->assertSame(0, MatatagTermNarrative::count());
    }

    public function test_a_term_that_does_not_exist_is_refused(): void
    {
        $this->write([['student_id' => $this->learnersA1[0]->id, 'term' => 4, 'can_do' => 'Fourth quarter.']])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Key Stage 1 has 3 terms; term 4 does not exist.']);
    }

    public function test_a_learner_from_another_school_cannot_be_written_up(): void
    {
        $this->write([['student_id' => $this->learnerB->id, 'term' => 1, 'can_do' => 'Not yours.']])
            ->assertStatus(422)
            ->assertJsonPath('code', 'student_not_on_roster');

        $this->assertSame(0, MatatagTermNarrative::count());
    }

    private function write(array $narratives)
    {
        return $this->as($this->adviserA1)->postJson('/api/matatag/narratives/bulk-upsert', [
            'class_section_id' => $this->sectionA1->id,
            'academic_year' => self::YEAR,
            'narratives' => $narratives,
        ]);
    }
}
