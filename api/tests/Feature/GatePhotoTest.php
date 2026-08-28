<?php

namespace Tests\Feature;

use App\Models\GateDevice;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Services\GatePhotoThumbnail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The photo half of a kiosk's local copy.
 *
 * Photos are the whole reason offline mode is hard: a 3,000-student campus has
 * ~90 MB of thumbnails and potentially gigabytes of originals, over a link that
 * struggles with either. So the things worth pinning are the ones that quietly
 * turn 90 MB back into gigabytes, or that let one school read another's faces:
 *
 *  - a served photo is actually **resized**, and the result is **cached** so the
 *    second kiosk on a campus pays nothing;
 *  - the cache key follows the *source object key*, and profile pictures are
 *    written under a fresh UUID each upload, so a re-photographed student gets a
 *    new hash rather than the old face forever;
 *  - `photo_hash` in the roster **matches** the ETag of the photo endpoint —
 *    that equality is the entire mechanism by which a kiosk knows what it
 *    already holds;
 *  - a device token reaches only its own institution's students;
 *  - an undecodable or missing object degrades instead of failing a sync.
 *
 * GD is not enabled in every PHP build (XAMPP ships it commented out), so the
 * resize cases skip rather than fail without it. To exercise that path without
 * editing php.ini, call PHPUnit directly — `artisan test` spawns a subprocess
 * that does not inherit `-d`, so the flag is silently lost there:
 *
 *   php -d extension=gd vendor/bin/phpunit --filter=GatePhotoTest
 */
class GatePhotoTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private Institution $otherSchool;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('r2');

        $this->school = Institution::factory()->create(['title' => 'Photo High']);
        $this->otherSchool = Institution::factory()->create(['title' => 'Elsewhere Academy']);

        $this->token = 'photo-token-'.uniqid();
        GateDevice::create([
            'institution_id' => $this->school->id,
            'name' => 'Main Gate',
            'gate_type' => 'enter',
            'device_token_hash' => hash('sha256', $this->token),
        ]);
    }

    public function test_a_large_photo_is_served_small_and_then_cached(): void
    {
        $this->requireGd();

        $student = $this->studentWithPhoto($this->jpeg(900, 1200), $key);

        $response = $this->asDevice()->get("/api/gate/photo/{$student->id}")->assertOk();

        $response->assertHeader('Content-Type', 'image/jpeg');
        $response->assertHeader('X-Gate-Photo-Resized', '1');

        [$width, $height] = getimagesizefromstring($response->getContent());
        $this->assertSame(GatePhotoThumbnail::MAX_EDGE, max($width, $height));
        // Portrait in, portrait out — a squashed face is worse than a big one.
        $this->assertGreaterThan($width, $height);

        $hash = sha1($key);
        Storage::disk('r2')->assertExists("kiosk-thumbs/{$hash}.jpg");
    }

    public function test_the_cached_thumbnail_is_what_later_requests_read(): void
    {
        $this->requireGd();

        $student = $this->studentWithPhoto($this->jpeg(900, 1200), $key);

        $this->asDevice()->get("/api/gate/photo/{$student->id}")->assertOk();

        // Delete the original: only a real cache hit can answer now. This is the
        // property that keeps the second, third and tenth kiosk on a campus from
        // each paying to resize the same 3,000 photos.
        Storage::disk('r2')->delete($key);

        $again = $this->asDevice()->get("/api/gate/photo/{$student->id}")->assertOk();
        $again->assertHeader('X-Gate-Photo-Resized', '1');
        $this->assertNotEmpty($again->getContent());
    }

    public function test_a_new_upload_gets_a_new_hash_rather_than_the_old_face(): void
    {
        $student = $this->studentWithPhoto($this->smallestJpeg(), $firstKey);
        $firstHash = app(GatePhotoThumbnail::class)->hashFor($student);

        // StudentController writes every upload under a fresh UUID, which is
        // what makes hashing the key sufficient to detect a re-photograph.
        $secondKey = $this->school->id.'/student/'.$student->id.'/profile/'.\Illuminate\Support\Str::uuid().'.jpg';
        Storage::disk('r2')->put($secondKey, $this->smallestJpeg());
        $student->update(['profile_picture' => $secondKey]);

        $this->assertNotSame($firstHash, app(GatePhotoThumbnail::class)->hashFor($student->fresh()));
        $this->assertNotSame($firstKey, $secondKey);
    }

    public function test_the_roster_hash_is_the_photo_etag(): void
    {
        $student = $this->studentWithPhoto($this->smallestJpeg(), $key);

        $rosterHash = $this->asDevice()->getJson('/api/gate/roster')->json('students.0.photo_hash');
        $this->assertNotNull($rosterHash);

        $etag = $this->asDevice()->get("/api/gate/photo/{$student->id}")->headers->get('ETag');

        // If these ever drift, a kiosk either re-downloads every photo on every
        // sync or never notices a new one. Both are silent.
        $this->assertSame('"'.$rosterHash.'"', $etag);
    }

    public function test_the_headers_the_kiosk_reads_are_exposed_to_it(): void
    {
        // Not a formality. A kiosk is cross-origin to the API, so a response
        // header it has not been *granted* reads back as null in script with no
        // error anywhere — which is how the clock correction shipped doing
        // nothing at all. `Date` teaches a Pi with no RTC what day it is, and
        // `ETag` is the hash a cached face is filed under.
        $exposed = array_map('strtolower', config('cors.exposed_headers'));

        $this->assertContains('date', $exposed);
        $this->assertContains('etag', $exposed);
    }

    public function test_a_photo_the_device_already_holds_answers_304(): void
    {
        $student = $this->studentWithPhoto($this->smallestJpeg(), $key);

        $etag = $this->asDevice()->get("/api/gate/photo/{$student->id}")->headers->get('ETag');

        $this->asDevice()
            ->withHeader('If-None-Match', $etag)
            ->get("/api/gate/photo/{$student->id}")
            ->assertStatus(304);
    }

    public function test_a_student_without_a_photo_is_a_404_and_advertises_no_hash(): void
    {
        $student = $this->enrolled();

        $this->asDevice()->get("/api/gate/photo/{$student->id}")->assertNotFound();
        $this->assertNull($this->asDevice()->getJson('/api/gate/roster')->json('students.0.photo_hash'));
    }

    public function test_a_photo_missing_from_the_bucket_does_not_break_the_sync(): void
    {
        $student = $this->enrolled();
        // A row pointing at an object that is not there — a restore, a botched
        // migration. The roster still lists the student; only the face is gone.
        $student->update(['profile_picture' => $this->school->id.'/student/'.$student->id.'/profile/vanished.jpg']);

        $this->asDevice()->get("/api/gate/photo/{$student->id}")->assertNotFound();
        $this->asDevice()->getJson('/api/gate/roster')->assertOk()->assertJsonCount(1, 'students');
    }

    public function test_an_undecodable_object_is_passed_through_rather_than_failing(): void
    {
        $student = $this->studentWithPhoto('this is not an image', $key);

        $response = $this->asDevice()->get("/api/gate/photo/{$student->id}")->assertOk();

        // Nothing to resize, so it is served as-is and deliberately not cached
        // as a thumbnail — the kiosk shows a broken image exactly as the rest of
        // the app would, and a fixed upload later produces a real thumbnail.
        $response->assertHeader('X-Gate-Photo-Resized', '0');
        Storage::disk('r2')->assertMissing('kiosk-thumbs/'.sha1($key).'.jpg');
    }

    public function test_a_device_cannot_read_another_schools_photos(): void
    {
        $outsider = Student::create([
            'first_name' => 'Rico', 'last_name' => 'Reyes',
            'gender' => 'male', 'birthdate' => '2012-05-05', 'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $outsider->id,
            'institution_id' => $this->otherSchool->id,
            'is_active' => true,
            'academic_year' => '2026-2027',
        ]);
        $key = $this->otherSchool->id.'/student/'.$outsider->id.'/profile/face.jpg';
        Storage::disk('r2')->put($key, $this->smallestJpeg());
        $outsider->update(['profile_picture' => $key]);

        // Knowing the UUID must not be enough.
        $this->asDevice()->get("/api/gate/photo/{$outsider->id}")->assertNotFound();
    }

    public function test_photos_need_a_device_token(): void
    {
        $student = $this->studentWithPhoto($this->smallestJpeg(), $key);

        $this->get("/api/gate/photo/{$student->id}")->assertUnauthorized();
    }

    private function requireGd(): void
    {
        if (! extension_loaded('gd') || ! function_exists('imagescale')) {
            $this->markTestSkipped('GD is not enabled in this PHP build; run with -d extension=gd.');
        }
    }

    private function asDevice(): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->token);
    }

    private function enrolled(): Student
    {
        $student = Student::create([
            'first_name' => 'Ana',
            'last_name' => 'Cruz',
            'gender' => 'female',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $this->school->id,
            'is_active' => true,
            'academic_year' => '2026-2027',
        ]);

        return $student;
    }

    private function studentWithPhoto(string $bytes, ?string &$key): Student
    {
        $student = $this->enrolled();

        $key = $this->school->id.'/student/'.$student->id.'/profile/'.\Illuminate\Support\Str::uuid().'.jpg';
        Storage::disk('r2')->put($key, $bytes);
        $student->update(['profile_picture' => $key]);

        return $student->fresh();
    }

    /** A real JPEG of the given size. Needs GD, so callers guard with requireGd(). */
    private function jpeg(int $width, int $height): string
    {
        $image = imagecreatetruecolor($width, $height);
        imagefill($image, 0, 0, imagecolorallocate($image, 40, 90, 160));
        ob_start();
        imagejpeg($image, null, 90);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    /**
     * A 1×1 JPEG, embedded so the tests that only care about hashing, scoping
     * and caching run on a build without GD.
     */
    private function smallestJpeg(): string
    {
        return (string) base64_decode(
            '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
            .'HBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzM//AABEIAAEAAQMBIgACEQEDEQH/xAAfAAAB'
            .'BQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFB'
            .'BhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RV'
            .'VldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrC'
            .'w8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A9/oooooA'
            .'//9k='
        );
    }
}
