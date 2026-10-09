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
 * A link records which subject stands for each learning area. It no longer
 * decides who may mark: any staff member with MATATAG Progress in the school
 * marks every area of every section (see ResolvesMatatagSection). What must
 * still hold is the school boundary, and Manage for changing the links.
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

    public function test_any_staff_member_sees_the_links_and_only_manage_changes_them(): void
    {
        $this->optInThroughApi();
        $url = "/api/matatag/sections/{$this->sectionA1->id}/learning-area-teachers";
        $head = $this->makeUser($this->schoolA, 'curriculum-head', 'head@matatag.test', 'tok-head');
        $this->assertFalse($head->hasModuleAccess('matatag-grading', 'manage', $this->schoolA->id));

        $this->as($this->mathTeacher)->getJson($url)->assertOk();
        $this->as($head)->getJson($url)->assertOk();
        $this->as($head)->putJson($url, [
            'links' => [['learning_area_id' => $this->area('reading-literacy')->id, 'subject_id' => $this->math->id]],
        ])->assertForbidden();
    }

    public function test_deleting_the_subject_removes_its_link(): void
    {
        $this->optInThroughApi();

        $this->math->delete();

        $this->assertFalse(MatatagSubjectLearningArea::where('learning_area_id', $this->area('mathematics')->id)->exists());
        $this->as($this->mathTeacher)->getJson($this->gridUrl())->assertOk();
    }

    // -----------------------------------------------------------------
    // Any staff member on the grid
    // -----------------------------------------------------------------

    /**
     * The school's decision: anyone on its staff with MATATAG Progress opens
     * every learning area of every section and marks it, whatever subject
     * they teach.
     */
    public function test_a_subject_teacher_opens_and_marks_every_area(): void
    {
        $this->optInThroughApi();

        $response = $this->as($this->mathTeacher)->getJson($this->gridUrl())->assertOk();

        $this->assertCount(5, $response->json('data.learning_areas'));
        $this->assertNull($response->json('data.markable_learning_area_ids'));
        $this->assertTrue($response->json('data.can_manage'));

        $this->write($this->mathTeacher, 'mathematics')->assertOk();
        $this->write($this->mathTeacher, 'reading-literacy')->assertOk();
        $this->assertSame(2, MatatagCompetencyRating::count());
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

    public function test_a_staff_member_with_no_subject_in_the_section_marks_it_without_manage(): void
    {
        $this->optInThroughApi();
        $colleague = $this->makeUser($this->schoolA, 'subject-teacher', 'colleague@matatag.test', 'tok-colleague');
        $this->revoke($colleague, 'matatag-grading.manage');

        $this->as($colleague)->getJson($this->gridUrl())->assertOk()->assertJsonPath('data.can_manage', true);
        $this->write($colleague, 'gmrc')->assertOk();

        $this->as($colleague)->postJson('/api/matatag/narratives/bulk-upsert', [
            'class_section_id' => $this->sectionA1->id,
            'narratives' => [['student_id' => $this->learnersA1[0]->id, 'term' => 1, 'can_do' => 'Counts to 100.']],
        ])->assertOk();
    }

    public function test_a_staff_member_without_matatag_progress_is_kept_out(): void
    {
        $this->optInThroughApi();
        $this->revoke($this->mathTeacher, 'matatag-grading.view');
        $this->revoke($this->mathTeacher, 'matatag-grading.manage');

        $this->as($this->mathTeacher)->getJson($this->gridUrl())->assertForbidden();
        $this->write($this->mathTeacher, 'mathematics')->assertForbidden();
        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    public function test_another_school_cannot_reach_the_section(): void
    {
        $this->optInThroughApi();

        $this->as($this->principalB)->getJson($this->gridUrl())->assertNotFound();
        $this->write($this->principalB, 'mathematics')->assertNotFound();
        $this->as($this->principalB)->postJson('/api/matatag/narratives/bulk-upsert', [
            'class_section_id' => $this->sectionA1->id,
            'narratives' => [['student_id' => $this->learnersA1[0]->id, 'term' => 1, 'can_do' => 'x']],
        ])->assertNotFound();

        $this->assertSame(0, MatatagCompetencyRating::count());
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

    public function test_another_schools_subject_is_not_looked_up(): void
    {
        $this->optInThroughApi();

        // Anyone in the same school may look it up; nobody outside it.
        $this->as($this->readingTeacher)
            ->getJson("/api/matatag/subjects/{$this->math->id}/learning-area")
            ->assertOk();

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
