<?php

namespace Tests\Feature\Matatag;

use App\Models\MatatagCompetencyRating;
use App\Models\MatatagSubjectLearningArea;
use App\Models\Subject;
use App\Models\User;
use App\Services\Matatag\LearningAreaTeachers;

/**
 * Subject teachers marking the learning area their subject stands for.
 *
 * The adviser owns the record and reaches every area. A subject teacher
 * reaches one section's grid only through a linked subject, and only that
 * subject's area — every test below that asserts a 403 is a place where one
 * missing check would let the Mathematics teacher rewrite Reading & Literacy.
 */
class MatatagLearningAreaTeacherTest extends MatatagTestCase
{
    /** Teaches Mathematics in section A1. Advises nothing. */
    private User $mathTeacher;

    /** Teaches Reading and Literacy in section A1. */
    private User $readingTeacher;

    private Subject $math;

    private Subject $reading;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mathTeacher = $this->makeUser($this->schoolA, 'subject-teacher', 'math@matatag.test', 'tok-math');
        $this->readingTeacher = $this->makeUser($this->schoolA, 'subject-teacher', 'reading@matatag.test', 'tok-reading');

        // Spelled the way Maranatha's sections actually spell them.
        $this->math = $this->makeSubject('Math', $this->mathTeacher);
        $this->reading = $this->makeSubject('Reading and literacy', $this->readingTeacher);
        $this->makeSubject('GMRC', $this->adviserA1);
        $this->makeSubject('MAKABANSA', $this->adviserA1);
        $this->makeSubject('Language', $this->adviserA1);
    }

    private function makeSubject(string $title, ?User $teacher, $section = null): Subject
    {
        $section ??= $this->sectionA1;

        return Subject::create([
            'institution_id' => $section->institution_id,
            'class_section_id' => $section->id,
            'adviser' => $teacher?->id,
            'title' => $title,
        ]);
    }

    private function optInThroughApi(): void
    {
        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertSuccessful();
    }

    private function gridUrl(?string $areaId = null, int $term = 1): string
    {
        return "/api/matatag/grid?class_section_id={$this->sectionA1->id}&term={$term}"
            .($areaId ? "&learning_area_id={$areaId}" : '');
    }

    private function write(User $user, string $areaKey, string $descriptor = 'B')
    {
        return $this->as($user)->postJson('/api/matatag/grid/bulk-upsert', [
            'class_section_id' => $this->sectionA1->id,
            'term' => 1,
            'ratings' => [[
                'student_id' => $this->learnersA1[0]->id,
                'slot_id' => $this->slotsFor($areaKey, 1)[0]->id,
                'descriptor' => $descriptor,
            ]],
        ]);
    }

    // -----------------------------------------------------------------
    // Linking
    // -----------------------------------------------------------------

    public function test_opting_in_links_each_area_to_the_subject_that_names_it(): void
    {
        $this->optInThroughApi();

        $links = MatatagSubjectLearningArea::where('class_section_id', $this->sectionA1->id)
            ->get()
            ->mapWithKeys(fn ($link) => [$link->learningArea->key => $link->subject->title])
            ->all();

        $this->assertSame([
            'gmrc' => 'GMRC',
            'language' => 'Language',
            'makabansa' => 'MAKABANSA',
            'mathematics' => 'Math',
            'reading-literacy' => 'Reading and literacy',
        ], collect($links)->sortKeys()->all());
    }

    public function test_two_subjects_with_the_same_name_are_left_for_the_adviser(): void
    {
        $this->makeSubject('Mathematics', $this->readingTeacher);

        $this->optInThroughApi();

        $this->assertFalse(MatatagSubjectLearningArea::where('class_section_id', $this->sectionA1->id)
            ->where('learning_area_id', $this->area('mathematics')->id)
            ->exists());
    }

    public function test_re_opting_in_never_overwrites_a_link_the_adviser_chose(): void
    {
        $this->optInThroughApi();

        $this->as($this->adviserA1)->putJson("/api/matatag/sections/{$this->sectionA1->id}/learning-area-teachers", [
            'links' => [['learning_area_id' => $this->area('mathematics')->id, 'subject_id' => $this->reading->id]],
        ])->assertOk();

        $this->optInThroughApi();

        $this->assertSame($this->reading->id, MatatagSubjectLearningArea::where('class_section_id', $this->sectionA1->id)
            ->where('learning_area_id', $this->area('mathematics')->id)
            ->value('subject_id'));
    }

    public function test_the_adviser_sees_every_area_its_subject_and_a_suggestion_for_the_unlinked(): void
    {
        $this->optIn($this->sectionA1);

        $response = $this->as($this->adviserA1)
            ->getJson("/api/matatag/sections/{$this->sectionA1->id}/learning-area-teachers")
            ->assertOk();

        $areas = collect($response->json('data.areas'))->keyBy('learning_area.key');

        $this->assertCount(5, $areas);
        $this->assertNull($areas['mathematics']['subject']);
        $this->assertSame($this->math->id, $areas['mathematics']['suggested_subject_id']);
        $this->assertCount(5, $response->json('data.subjects'));
    }

    public function test_the_adviser_can_link_and_unlink_an_area(): void
    {
        $this->optIn($this->sectionA1);
        $area = $this->area('mathematics')->id;
        $url = "/api/matatag/sections/{$this->sectionA1->id}/learning-area-teachers";

        $this->as($this->adviserA1)->putJson($url, [
            'links' => [['learning_area_id' => $area, 'subject_id' => $this->math->id]],
        ])->assertOk();

        $this->assertSame(1, MatatagSubjectLearningArea::count());

        $this->as($this->adviserA1)->putJson($url, [
            'links' => [['learning_area_id' => $area, 'subject_id' => null]],
        ])->assertOk();

        $this->assertSame(0, MatatagSubjectLearningArea::count());
    }

    public function test_an_area_cannot_be_linked_to_another_sections_subject(): void
    {
        $this->optIn($this->sectionA1);
        $elsewhere = $this->makeSubject('Math', $this->mathTeacher, $this->sectionA2);
        $otherSchool = $this->makeSubject('Math', $this->principalB, $this->sectionB1);

        foreach ([$elsewhere, $otherSchool] as $subject) {
            $this->as($this->adviserA1)
                ->putJson("/api/matatag/sections/{$this->sectionA1->id}/learning-area-teachers", [
                    'links' => [['learning_area_id' => $this->area('mathematics')->id, 'subject_id' => $subject->id]],
                ])
                ->assertStatus(422)
                ->assertJsonPath('code', 'subject_not_in_section');
        }

        $this->assertSame(0, MatatagSubjectLearningArea::count());
    }

    public function test_a_subject_teacher_cannot_see_or_change_the_links(): void
    {
        $this->optInThroughApi();
        $url = "/api/matatag/sections/{$this->sectionA1->id}/learning-area-teachers";

        $this->as($this->mathTeacher)->getJson($url)->assertForbidden();
        $this->as($this->mathTeacher)->putJson($url, [
            'links' => [['learning_area_id' => $this->area('reading-literacy')->id, 'subject_id' => $this->math->id]],
        ])->assertForbidden();
    }

    public function test_deleting_the_subject_hands_the_area_back_to_the_adviser(): void
    {
        $this->optInThroughApi();

        $this->math->delete();

        $this->assertFalse(MatatagSubjectLearningArea::where('learning_area_id', $this->area('mathematics')->id)->exists());
        $this->as($this->mathTeacher)->getJson($this->gridUrl())->assertForbidden();
    }

    // -----------------------------------------------------------------
    // The subject teacher on the grid
    // -----------------------------------------------------------------

    public function test_a_subject_teacher_opens_only_their_own_area(): void
    {
        $this->optInThroughApi();

        $response = $this->as($this->mathTeacher)->getJson($this->gridUrl())->assertOk();

        $this->assertSame('mathematics', $response->json('data.learning_area.key'));
        $this->assertSame(['mathematics'], array_column($response->json('data.learning_areas'), 'key'));
        $this->assertSame([$this->area('mathematics')->id], $response->json('data.markable_learning_area_ids'));
        $this->assertTrue($response->json('data.can_manage'));

        $this->as($this->mathTeacher)
            ->getJson($this->gridUrl($this->area('reading-literacy')->id))
            ->assertForbidden();
    }

    public function test_the_adviser_still_reaches_every_area(): void
    {
        $this->optInThroughApi();

        $response = $this->as($this->adviserA1)->getJson($this->gridUrl())->assertOk();

        $this->assertCount(5, $response->json('data.learning_areas'));
        $this->assertNull($response->json('data.markable_learning_area_ids'));

        $this->write($this->adviserA1, 'mathematics')->assertOk();
    }

    public function test_a_subject_teacher_marks_their_area_and_is_recorded_as_marking_it(): void
    {
        $this->optInThroughApi();

        $this->write($this->mathTeacher, 'mathematics', 'A')->assertOk();

        $rating = MatatagCompetencyRating::sole();
        $this->assertSame('A', $rating->descriptor);
        $this->assertSame($this->mathTeacher->id, $rating->marked_by);
    }

    public function test_a_subject_teacher_cannot_write_into_another_area(): void
    {
        $this->optInThroughApi();

        $this->write($this->mathTeacher, 'reading-literacy')
            ->assertForbidden()
            ->assertJsonPath('code', 'area_not_yours');

        // One stray slot in an otherwise legitimate save refuses all of it.
        $this->as($this->mathTeacher)->postJson('/api/matatag/grid/bulk-upsert', [
            'class_section_id' => $this->sectionA1->id,
            'term' => 1,
            'ratings' => [
                ['student_id' => $this->learnersA1[0]->id, 'slot_id' => $this->slotsFor('mathematics', 1)[0]->id, 'descriptor' => 'A'],
                ['student_id' => $this->learnersA1[0]->id, 'slot_id' => $this->slotsFor('gmrc', 1)[0]->id, 'descriptor' => 'A'],
            ],
        ])->assertForbidden();

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    public function test_a_teacher_with_no_linked_subject_is_kept_out(): void
    {
        $this->optInThroughApi();
        $stranger = $this->makeUser($this->schoolA, 'subject-teacher', 'stranger@matatag.test', 'tok-stranger');

        $this->as($stranger)->getJson($this->gridUrl())->assertForbidden();
        $this->write($stranger, 'mathematics')->assertForbidden();

        // Teaching a subject in the section next door reaches nothing here.
        $this->makeSubject('Math', $stranger, $this->sectionA2);
        $this->as($stranger)->getJson($this->gridUrl())->assertForbidden();
    }

    public function test_reassigning_the_subject_moves_the_right_to_mark(): void
    {
        $this->optInThroughApi();

        $this->math->update(['adviser' => $this->readingTeacher->id]);

        $this->write($this->mathTeacher, 'mathematics')->assertForbidden();
        $this->write($this->readingTeacher, 'mathematics')->assertOk();
        $this->write($this->readingTeacher, 'reading-literacy')->assertOk();
    }

    public function test_a_link_from_another_year_reaches_nothing_in_this_one(): void
    {
        $this->optInThroughApi();

        MatatagSubjectLearningArea::query()->update(['academic_year' => '2025-2026']);

        $this->as($this->mathTeacher)->getJson($this->gridUrl())->assertForbidden();
        $this->write($this->mathTeacher, 'mathematics')->assertForbidden();
    }

    public function test_a_subject_teacher_reaches_nothing_else_in_the_section(): void
    {
        $this->optInThroughApi();
        $section = $this->sectionA1->id;
        $student = $this->learnersA1[0]->id;

        foreach ([
            "/api/matatag/narratives?class_section_id={$section}",
            "/api/matatag/attendance?class_section_id={$section}",
            "/api/matatag/progress-report?class_section_id={$section}",
            "/api/matatag/progress-report/{$student}?class_section_id={$section}",
            "/api/matatag/workbook?class_section_id={$section}",
        ] as $url) {
            $this->as($this->mathTeacher)->getJson($url)->assertForbidden();
        }

        $this->as($this->mathTeacher)->postJson('/api/matatag/narratives/bulk-upsert', [
            'class_section_id' => $section,
            'narratives' => [['student_id' => $student, 'term' => 1, 'can_do' => 'Counts to 100.']],
        ])->assertForbidden();

        $this->as($this->mathTeacher)
            ->postJson("/api/matatag/sections/{$section}/opt-in")
            ->assertForbidden();

        // Nor does the section appear in their list of Key Stage 1 sections.
        $ids = array_column($this->as($this->mathTeacher)->getJson('/api/matatag/sections')->json('data.sections'), 'id');
        $this->assertNotContains($section, $ids);
    }

    // -----------------------------------------------------------------
    // The subject page's lookup
    // -----------------------------------------------------------------

    public function test_a_subject_says_which_area_it_stands_for(): void
    {
        $this->optInThroughApi();

        $this->as($this->mathTeacher)
            ->getJson("/api/matatag/subjects/{$this->math->id}/learning-area")
            ->assertOk()
            ->assertJsonPath('data.learning_area.key', 'mathematics')
            ->assertJsonPath('data.class_section_id', $this->sectionA1->id)
            ->assertJsonPath('data.academic_year', self::YEAR);
    }

    public function test_an_unlinked_subject_or_a_section_off_matatag_answers_null(): void
    {
        $unlinked = $this->makeSubject('Music', $this->mathTeacher);
        $this->optInThroughApi();

        $this->as($this->mathTeacher)
            ->getJson("/api/matatag/subjects/{$unlinked->id}/learning-area")
            ->assertOk()
            ->assertJsonPath('data', null);

        $this->as($this->principalA)
            ->deleteJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertOk();

        $this->as($this->mathTeacher)
            ->getJson("/api/matatag/subjects/{$this->math->id}/learning-area")
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    public function test_another_teachers_subject_is_not_looked_up(): void
    {
        $this->optInThroughApi();

        $this->as($this->readingTeacher)
            ->getJson("/api/matatag/subjects/{$this->math->id}/learning-area")
            ->assertForbidden();

        $this->as($this->principalB)
            ->getJson("/api/matatag/subjects/{$this->math->id}/learning-area")
            ->assertNotFound();
    }

    // -----------------------------------------------------------------
    // Matching
    // -----------------------------------------------------------------

    public function test_names_are_matched_whatever_the_casing_and_punctuation(): void
    {
        $this->optIn($this->sectionA2);
        $teachers = app(LearningAreaTeachers::class);

        foreach ([
            'reading-literacy' => ['READING AND LITERACY', 'Reading & Literacy', 'Reading/Literacy'],
            'mathematics' => ['MATHEMATICS', 'Maths', 'math.'],
            'gmrc' => ['Good Manners and Right Conduct', 'gmrc', 'Good Manners & Right Conduct (GMRC)'],
            'makabansa' => ['Makabansa'],
            'language' => ['LANGUAGE'],
        ] as $key => $titles) {
            foreach ($titles as $title) {
                $subject = new Subject(['title' => $title]);
                $subject->id = 'subject-'.$title;

                $this->assertSame(
                    [$this->area($key)->id => $subject->id],
                    $teachers->suggest(collect([$this->area($key)]), collect([$subject])),
                    "'{$title}' should suggest {$key}",
                );
            }
        }

        $unrelated = new Subject(['title' => 'Music']);
        $unrelated->id = 'music';
        $this->assertSame([], $teachers->suggest(collect([$this->area('mathematics')]), collect([$unrelated])));
    }
}
