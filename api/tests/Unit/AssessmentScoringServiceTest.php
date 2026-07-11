<?php

namespace Tests\Unit;

use App\Services\AssessmentScoringService;
use PHPUnit\Framework\TestCase;

class AssessmentScoringServiceTest extends TestCase
{
    private AssessmentScoringService $service;

    protected function setUp(): void
    {
        $this->service = new AssessmentScoringService();
    }

    public function test_fill_in_the_blanks_accepts_zero_as_correct_answer(): void
    {
        $q = ['blanks' => ['0']];

        $this->assertTrue($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['0']));
        $this->assertFalse($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['1']));
    }

    public function test_fill_in_the_blanks_zero_among_alternatives(): void
    {
        $q = ['blanks' => ['0 | zero']];

        $this->assertTrue($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['0']));
        $this->assertTrue($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['zero']));
        $this->assertFalse($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['none']));
    }

    public function test_fill_in_the_blanks_case_insensitive_and_trimmed(): void
    {
        $q = ['blanks' => ['Manila | Manila City']];

        $this->assertTrue($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['  manila  ']));
        $this->assertTrue($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['MANILA CITY']));
        $this->assertFalse($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['Cebu']));
    }

    public function test_fill_in_the_blanks_requires_every_blank(): void
    {
        $q = ['blanks' => ['0', '4']];

        $this->assertTrue($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['0', '4']));
        $this->assertFalse($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['0']));
        $this->assertFalse($this->service->isQuestionCorrect('fill_in_the_blanks', $q, ['0', '5']));
    }

    public function test_short_answer_accepts_zero_as_answer_key(): void
    {
        $q = ['answer' => '0'];

        $this->assertTrue($this->service->isQuestionCorrect('short_answer', $q, '0'));
        $this->assertFalse($this->service->isQuestionCorrect('short_answer', $q, '1'));
    }

    public function test_short_answer_with_zero_key_is_not_manual(): void
    {
        $this->assertFalse($this->service->isManualQuestion(['type' => 'short_answer', 'answer' => '0']));
        $this->assertTrue($this->service->isManualQuestion(['type' => 'short_answer', 'answer' => '']));
        $this->assertTrue($this->service->isManualQuestion(['type' => 'short_answer', 'answer' => ' | ']));
    }

    public function test_multiple_choice_keeps_zero_values(): void
    {
        $q = ['answer' => ['0', '2']];

        $this->assertTrue($this->service->isQuestionCorrect('multiple_choice', $q, ['0', '2']));
        $this->assertFalse($this->service->isQuestionCorrect('multiple_choice', $q, ['2']));
    }

    public function test_objective_score_sums_points_for_correct_answers(): void
    {
        $questions = [
            ['type' => 'fill_in_the_blanks', 'blanks' => ['0'], 'points' => 1],
            ['type' => 'true_false', 'answer' => 'True', 'points' => 2],
        ];
        $answers = ['0' => ['0'], '1' => 'true'];

        $this->assertSame(3.0, $this->service->objectiveScore($questions, $answers));
    }
}
