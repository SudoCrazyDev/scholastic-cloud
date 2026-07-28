<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Support\MediaUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * `media:repair-urls` repoints upload links already baked into stored content.
 *
 * Assessment content keeps only the finished URL — prompt HTML, per-choice
 * images, Drag The Picture cards — so unlike lesson attachments it cannot be
 * re-derived on read and has to be rewritten in place. The command walks every
 * string in the content tree to find them, which is also what makes it
 * dangerous: these tests pin down that it repairs what is stale, leaves
 * everything else untouched, and can be run twice.
 */
class RepairMediaUrlsTest extends TestCase
{
    use RefreshDatabase;

    private const IMAGE = 'inst-1/assessments/images/diagram.png';

    private const CHOICE = 'inst-1/assessments/images/choice-a.png';

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('r2');
        config(['filesystems.disks.r2.url' => null]);
    }

    private function makeItem(array $questions): SubjectEcrItem
    {
        $institution = Institution::factory()->create();
        $section = ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => 'Grade 7',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);
        $subject = Subject::create([
            'institution_id' => $institution->id,
            'class_section_id' => $section->id,
            'title' => 'Christian Living 7',
        ]);
        $ecr = SubjectEcr::create(['subject_id' => $subject->id, 'title' => 'Written Works', 'percentage' => 100]);

        return SubjectEcrItem::create([
            'subject_ecr_id' => $ecr->id,
            'type' => 'quiz',
            'status' => 'published',
            'title' => 'Pretest',
            'content' => ['questions' => $questions],
            'quarter' => '1',
            'score' => 5,
        ]);
    }

    public function test_it_repoints_links_left_behind_by_a_previous_origin(): void
    {
        MediaUrl::forceOrigin('https://app.example.test');
        $stale = MediaUrl::for(self::CHOICE);
        $stalePrompt = MediaUrl::for(self::IMAGE);
        MediaUrl::forceOrigin(null);

        $item = $this->makeItem([[
            'type' => 'single_choice',
            'question' => '<p>Faith means trusting God.<img src="'.e($stalePrompt).'"></p>',
            'choices' => ['', ''],
            'choiceImages' => [$stale, ''],
        ]]);

        $this->artisan('media:repair-urls')->assertSuccessful();

        $content = $item->fresh()->content;
        $this->assertSame(MediaUrl::for(self::CHOICE), $content['questions'][0]['choiceImages'][0]);
        $this->assertStringContainsString(e(MediaUrl::for(self::IMAGE)), $content['questions'][0]['question']);
        $this->assertStringNotContainsString('app.example.test', json_encode($content));
    }

    public function test_it_repoints_expired_presigned_links(): void
    {
        $presigned = 'https://bucket.acct.r2.cloudflarestorage.com/'.self::CHOICE
            .'?X-Amz-Expires=604800&X-Amz-Signature=abc123';

        $item = $this->makeItem([[
            'type' => 'single_choice',
            'question' => 'Which is smallest?',
            'choices' => ['', ''],
            'choiceImages' => [$presigned, ''],
        ]]);

        $this->artisan('media:repair-urls')->assertSuccessful();

        $this->assertSame(
            MediaUrl::for(self::CHOICE),
            $item->fresh()->content['questions'][0]['choiceImages'][0]
        );
    }

    /**
     * The walker sees every string in the tree, including answer choices and
     * prompt text. Rewriting any of those would corrupt the assessment.
     */
    public function test_it_leaves_ordinary_content_alone(): void
    {
        $questions = [[
            'type' => 'single_choice',
            'question' => 'Watch <a href="https://www.youtube.com/watch?v=abc123">this clip</a>. Which is smallest?',
            'choices' => ['A', '-4', 'inst-1/assessments/images/looks-like-a-key.png', 'https://example.test/x?path=secret.png'],
            'choiceImages' => ['', '', '', ''],
            'points' => 1,
        ]];

        $item = $this->makeItem($questions);

        $this->artisan('media:repair-urls')
            ->expectsOutputToContain('Rewrote 0 URL(s).')
            ->assertSuccessful();

        $this->assertSame($questions, $item->fresh()->content['questions']);
    }

    public function test_a_second_run_changes_nothing(): void
    {
        MediaUrl::forceOrigin('https://app.example.test');
        $stale = MediaUrl::for(self::CHOICE);
        MediaUrl::forceOrigin(null);

        $item = $this->makeItem([[
            'type' => 'single_choice',
            'question' => '<p>Pick one.<img src="'.e($stale).'"></p>',
            'choices' => ['', ''],
            'choiceImages' => [$stale, ''],
        ]]);

        $this->artisan('media:repair-urls')->assertSuccessful();
        $repaired = $item->fresh()->content;

        $this->artisan('media:repair-urls')
            ->expectsOutputToContain('Rewrote 0 URL(s).')
            ->assertSuccessful();

        $this->assertSame($repaired, $item->fresh()->content);
    }

    public function test_dry_run_reports_without_writing(): void
    {
        MediaUrl::forceOrigin('https://app.example.test');
        $stale = MediaUrl::for(self::CHOICE);
        MediaUrl::forceOrigin(null);

        $item = $this->makeItem([[
            'type' => 'single_choice',
            'question' => 'Pick one.',
            'choices' => ['', ''],
            'choiceImages' => [$stale, ''],
        ]]);

        $this->artisan('media:repair-urls', ['--dry-run' => true])
            ->expectsOutputToContain('Would rewrite 1 URL(s).')
            ->assertSuccessful();

        $this->assertSame($stale, $item->fresh()->content['questions'][0]['choiceImages'][0]);
    }

    /**
     * A link repaired out of a path-style presigned URL can keep the bucket name
     * ahead of the object key, because `pathFrom()` only strips a bucket segment
     * matching the configured name. Serving tolerates it, but the stored path has
     * to be settled or every later repair re-signs a key that does not exist.
     */
    public function test_it_drops_a_stale_bucket_segment_from_the_stored_path(): void
    {
        Storage::disk('r2')->put(self::CHOICE, 'image-bytes');

        MediaUrl::forceOrigin('https://api.example.test');
        $withBucket = MediaUrl::for('old-bucket-name/'.self::CHOICE);
        MediaUrl::forceOrigin(null);

        $item = $this->makeItem([[
            'type' => 'single_choice',
            'question' => 'Faith means trusting God.',
            'choices' => [null, null],
            'choiceImages' => [$withBucket, ''],
            'answer' => 'A',
            'points' => 1,
        ]]);

        $this->artisan('media:repair-urls')->assertSuccessful();

        $repaired = $item->fresh()->content['questions'][0]['choiceImages'][0];
        $this->assertStringNotContainsString('old-bucket-name', $repaired);
        $this->assertSame(MediaUrl::for(self::CHOICE), $repaired);
        $this->get($repaired)->assertOk();
    }

    /**
     * The console has no request to derive an origin from, so it falls back to
     * APP_URL — which is exactly the value that tends to be wrong on a server.
     * `--origin=` is how content gets repointed without editing `.env` first.
     */
    public function test_an_explicit_origin_is_what_gets_written(): void
    {
        $presigned = 'https://bucket.acct.r2.cloudflarestorage.com/'.self::CHOICE
            .'?X-Amz-Expires=604800&X-Amz-Signature=abc123';

        $item = $this->makeItem([[
            'type' => 'single_choice',
            'question' => 'Pick one.',
            'choices' => ['', ''],
            'choiceImages' => [$presigned, ''],
        ]]);

        $this->artisan('media:repair-urls', ['--origin' => 'https://api.example.test'])
            ->assertSuccessful();

        $this->assertStringStartsWith(
            'https://api.example.test/api/media',
            $item->fresh()->content['questions'][0]['choiceImages'][0]
        );
    }
}
