<?php

namespace Tests\Feature;

use App\Support\MediaUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Uploads used to be handed out as presigned URLs that expire after at most
 * 7 days, so assessment images and lesson attachments quietly became broken
 * links. Every URL the app produces for an upload must now be permanent.
 */
class PermanentMediaUrlTest extends TestCase
{
    use RefreshDatabase;

    private const PATH = 'inst-1/assessments/images/diagram.png';

    public function test_generated_urls_carry_no_expiry(): void
    {
        config(['filesystems.disks.r2.url' => null]);

        $url = MediaUrl::for(self::PATH);

        $this->assertNotNull($url);
        $this->assertStringNotContainsString('X-Amz-Expires', $url);
        $this->assertStringNotContainsString('expires=', $url);
        $this->assertStringContainsString('signature=', $url);
    }

    public function test_a_signed_url_serves_the_object(): void
    {
        Storage::fake('r2');
        config(['filesystems.disks.r2.url' => null]);
        Storage::disk('r2')->put(self::PATH, 'image-bytes');

        $url = MediaUrl::for(self::PATH);

        $response = $this->get($url);

        $response->assertOk();
        $response->assertHeader('Content-Type', 'image/png');
        $this->assertSame('image-bytes', $response->streamedContent());
    }

    public function test_a_tampered_url_is_rejected(): void
    {
        Storage::fake('r2');
        config(['filesystems.disks.r2.url' => null]);
        Storage::disk('r2')->put(self::PATH, 'image-bytes');
        Storage::disk('r2')->put('inst-2/secrets/private.png', 'not-yours');

        $url = MediaUrl::for(self::PATH);
        $swapped = str_replace(rawurlencode(self::PATH), rawurlencode('inst-2/secrets/private.png'), $url);

        $this->get($swapped)->assertForbidden();
    }

    public function test_a_public_bucket_domain_is_used_when_configured(): void
    {
        config(['filesystems.disks.r2.url' => 'https://cdn.example.test']);

        $this->assertSame('https://cdn.example.test/'.self::PATH, MediaUrl::for(self::PATH));
    }

    /**
     * The repair command and the delete-on-replace path both need to map a URL
     * we handed out at some point back to its object key.
     */
    public function test_urls_map_back_to_their_object_key(): void
    {
        config(['filesystems.disks.r2.url' => null]);
        $this->assertSame(self::PATH, MediaUrl::pathFrom(MediaUrl::for(self::PATH)));

        config(['filesystems.disks.r2.url' => 'https://cdn.example.test']);
        $this->assertSame(self::PATH, MediaUrl::pathFrom(MediaUrl::for(self::PATH)));

        $legacy = 'https://bucket.acct.r2.cloudflarestorage.com/'.self::PATH.'?X-Amz-Expires=604800&X-Amz-Signature=abc';
        $this->assertSame(self::PATH, MediaUrl::pathFrom($legacy));
    }

    public function test_third_party_links_are_left_alone(): void
    {
        $this->assertNull(MediaUrl::pathFrom('https://www.youtube.com/watch?v=abc123'));
        $this->assertNull(MediaUrl::pathFrom(''));
        $this->assertNull(MediaUrl::clean('../../etc/passwd'));
    }
}
