<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentSection;
use App\Models\Subject;
use App\Models\Topic;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Regression: file blocks in lesson content store the presigned URL generated
 * at upload time, which expires after 7 days (R2/S3 signature limit). Students
 * opening my-lessons/:id later hit "ExpiredRequest — Request has expired".
 * Read endpoints must re-sign a fresh URL from the stored `path` every time.
 */
class StudentLessonFileUrlTest extends TestCase
{
    use RefreshDatabase;

    private const STALE_URL = 'https://bucket.r2.example/stale.pdf?X-Amz-Expires=604800&X-Amz-Signature=expired';
    private const FILE_PATH = 'inst-1/subjects/sub-1/lessons/top-1/lesson.pdf';

    private User $user;
    private Subject $subject;
    private Topic $topic;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('r2');

        $institution = Institution::factory()->create();
        $this->user = User::factory()->create([
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->user->id,
            'institution_id' => $institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $section = ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => 'Grade 1',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);
        $this->subject = Subject::create([
            'institution_id' => $institution->id,
            'class_section_id' => $section->id,
            'title' => 'Science',
        ]);

        $student = Student::create([
            'user_id' => $this->user->id,
            'first_name' => 'Alice',
            'last_name' => 'Student',
            'gender' => 'female',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);
        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $section->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);

        $this->topic = Topic::create([
            'subject_id' => $this->subject->id,
            'title' => 'Lesson with PDF',
            'quarter' => '1',
            'order' => 1,
            'is_published' => true,
            'content' => [
                [
                    'id' => 'block-1',
                    'type' => 'file',
                    'path' => self::FILE_PATH,
                    'url' => self::STALE_URL,
                    'name' => 'lesson.pdf',
                    'mime' => 'application/pdf',
                    'size' => 12345,
                ],
            ],
        ]);
    }

    public function test_student_lesson_show_resigns_file_block_urls(): void
    {
        $block = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/student-lessons/{$this->topic->id}")
            ->assertOk()
            ->json('data.content.0');

        $this->assertSame(self::FILE_PATH, $block['path']);
        $this->assertNotSame(self::STALE_URL, $block['url'], 'Stored (expired) presigned URL was echoed back to the student.');
        $this->assertNotEmpty($block['url']);
    }

    public function test_teacher_topic_show_resigns_file_block_urls(): void
    {
        $block = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/topics/{$this->topic->id}")
            ->assertOk()
            ->json('data.content.0');

        $this->assertNotSame(self::STALE_URL, $block['url'], 'Stored (expired) presigned URL was echoed back to the teacher.');
        $this->assertNotEmpty($block['url']);
    }

    public function test_teacher_topic_index_resigns_file_block_urls(): void
    {
        $block = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/topics?subject_id=' . $this->subject->id)
            ->assertOk()
            ->json('data.0.content.0');

        $this->assertNotSame(self::STALE_URL, $block['url'], 'Stored (expired) presigned URL was echoed back in the topic list.');
        $this->assertNotEmpty($block['url']);
    }
}
