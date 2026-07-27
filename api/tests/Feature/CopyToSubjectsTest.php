<?php

namespace Tests\Feature;

use App\Models\AssessmentQuestion;
use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\Topic;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Teachers run the same subject across several sections, so assessment methods
 * and lessons need to be copyable between their assigned subjects instead of
 * being rebuilt by hand each time.
 */
class CopyToSubjectsTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private Subject $source;

    private Subject $target;

    private Subject $targetWithoutComponents;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('r2');

        $this->institution = Institution::factory()->create();

        $user = User::factory()->create([
            'email' => 'teacher.copy-test@example.com',
            'token' => 'copy-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->source = $this->makeSubject('Math 7 - A', 'Section A');
        $this->target = $this->makeSubject('Math 7 - B', 'Section B');
        $this->targetWithoutComponents = $this->makeSubject('Math 7 - C', 'Section C');

        SubjectEcr::create(['subject_id' => $this->source->id, 'title' => 'Written Works', 'percentage' => 100]);
        SubjectEcr::create(['subject_id' => $this->target->id, 'title' => 'Performance Tasks', 'percentage' => 40]);
        SubjectEcr::create(['subject_id' => $this->target->id, 'title' => 'Written Works', 'percentage' => 60]);
    }

    private function makeSubject(string $title, string $sectionTitle): Subject
    {
        $section = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'title' => $sectionTitle,
            'academic_year' => '2026-2027',
        ]);

        return Subject::create([
            'institution_id' => $this->institution->id,
            'class_section_id' => $section->id,
            'title' => $title,
        ]);
    }

    private function auth(): self
    {
        return $this->withHeader('Authorization', 'Bearer copy-token');
    }

    public function test_an_assessment_method_copies_with_its_questions(): void
    {
        $sourceEcr = SubjectEcr::where('subject_id', $this->source->id)->first();
        $item = SubjectEcrItem::create([
            'subject_ecr_id' => $sourceEcr->id,
            'type' => 'quiz',
            'status' => 'published',
            'title' => 'Quiz 1: Integers',
            'content_version' => 2,
            'content' => ['settings' => ['max_attempts' => 3]],
            'quarter' => '1',
            'due_at' => now()->addWeek(),
            'score' => 5,
        ]);
        AssessmentQuestion::create([
            'subject_ecr_item_id' => $item->id,
            'position' => 0,
            'type' => 'single_choice',
            'question' => 'What is 2 + 2?',
            'points' => 5,
            'config' => ['choices' => ['3', '4'], 'answer' => 'B'],
        ]);

        $response = $this->auth()->postJson("/api/subjects-ecr-items/{$item->id}/copy", [
            'target_subject_ids' => [$this->target->id],
        ]);

        $response->assertOk();
        $this->assertSame(1, $response->json('data.copied'));

        $copy = SubjectEcrItem::where('title', 'Quiz 1: Integers')
            ->where('id', '!=', $item->id)
            ->firstOrFail();

        // Attached under the same-named component in the target subject.
        $this->assertSame('Written Works', $copy->subjectEcr->title);
        $this->assertSame($this->target->id, $copy->subjectEcr->subject_id);

        // Copies land as drafts with section-specific scheduling cleared.
        $this->assertSame('draft', $copy->status);
        $this->assertNull($copy->due_at);

        $copiedQuestions = AssessmentQuestion::where('subject_ecr_item_id', $copy->id)->get();
        $this->assertCount(1, $copiedQuestions);
        $this->assertSame('What is 2 + 2?', $copiedQuestions->first()->question);
        $this->assertSame(['choices' => ['3', '4'], 'answer' => 'B'], $copiedQuestions->first()->config);

        // The original is untouched.
        $item->refresh();
        $this->assertSame('published', $item->status);
        $this->assertCount(1, AssessmentQuestion::where('subject_ecr_item_id', $item->id)->get());
    }

    public function test_a_target_without_components_is_reported_not_silently_dropped(): void
    {
        $sourceEcr = SubjectEcr::where('subject_id', $this->source->id)->first();
        $item = SubjectEcrItem::create([
            'subject_ecr_id' => $sourceEcr->id,
            'type' => 'quiz',
            'title' => 'Quiz 2',
            'content_version' => 2,
        ]);

        $response = $this->auth()->postJson("/api/subjects-ecr-items/{$item->id}/copy", [
            'target_subject_ids' => [$this->target->id, $this->targetWithoutComponents->id],
        ]);

        $response->assertOk();
        $this->assertSame(1, $response->json('data.copied'));
        $this->assertCount(1, $response->json('data.skipped'));
        $this->assertSame($this->targetWithoutComponents->id, $response->json('data.skipped.0.subject_id'));
    }

    public function test_a_lesson_copies_with_its_own_copy_of_each_attachment(): void
    {
        $filePath = $this->institution->id.'/subjects/'.$this->source->id.'/lessons/original/notes.pdf';
        Storage::disk('r2')->put($filePath, 'pdf-bytes');

        $topic = Topic::create([
            'subject_id' => $this->source->id,
            'quarter' => '1',
            'title' => 'Adding Integers',
            'is_published' => true,
            'content' => [
                ['id' => 'b1', 'type' => 'rich_text', 'html' => '<p>Hello</p>'],
                ['id' => 'b2', 'type' => 'file', 'path' => $filePath, 'url' => 'stale', 'name' => 'notes.pdf'],
                ['id' => 'b3', 'type' => 'assessment', 'subject_ecr_item_id' => 'belongs-to-source'],
            ],
        ]);

        $response = $this->auth()->postJson("/api/topics/{$topic->id}/copy", [
            'target_subject_ids' => [$this->target->id],
        ]);

        $response->assertOk();
        $this->assertSame(1, $response->json('data.copied'));
        $this->assertSame(1, $response->json('data.dropped_assessment_blocks'));

        $copy = Topic::where('subject_id', $this->target->id)->firstOrFail();
        $this->assertFalse((bool) $copy->is_published);

        $blocks = $copy->content;
        $this->assertCount(2, $blocks, 'the assessment block should not carry over');

        $copiedFile = collect($blocks)->firstWhere('type', 'file');
        $this->assertNotSame($filePath, $copiedFile['path']);
        Storage::disk('r2')->assertExists($copiedFile['path']);

        // Deleting the source lesson must not break the copy.
        $this->auth()->deleteJson("/api/topics/{$topic->id}")->assertOk();
        Storage::disk('r2')->assertMissing($filePath);
        Storage::disk('r2')->assertExists($copiedFile['path']);
    }

    public function test_re_uploading_an_assessment_image_removes_the_one_it_replaced(): void
    {
        $first = $this->auth()->post('/api/subjects-ecr-items/images', [
            'file' => UploadedFile::fake()->create('one.png', 8, 'image/png'),
        ]);
        $first->assertCreated();
        $firstPath = $first->json('data.path');
        Storage::disk('r2')->assertExists($firstPath);

        $second = $this->auth()->post('/api/subjects-ecr-items/images', [
            'file' => UploadedFile::fake()->create('two.png', 8, 'image/png'),
            'previous_url' => $first->json('data.url'),
        ]);
        $second->assertCreated();

        Storage::disk('r2')->assertMissing($firstPath);
        Storage::disk('r2')->assertExists($second->json('data.path'));
    }

    public function test_a_replacement_hint_cannot_delete_another_institutions_file(): void
    {
        Storage::disk('r2')->put('someone-else/assessments/images/private.png', 'not-yours');

        $this->auth()->post('/api/subjects-ecr-items/images', [
            'file' => UploadedFile::fake()->create('mine.png', 8, 'image/png'),
            'previous_path' => 'someone-else/assessments/images/private.png',
        ])->assertCreated();

        Storage::disk('r2')->assertExists('someone-else/assessments/images/private.png');
    }
}
