<?php

namespace Tests\Feature;

use App\Support\MediaUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
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

    /**
     * The signature must not cover the scheme. TLS is terminated at a proxy in
     * production and forwarded as plain HTTP, so a URL minted as `https` arrives
     * looking like `http` — which used to fail the check and turn every image
     * and PDF into a broken link.
     */
    public function test_a_link_still_validates_when_the_request_arrives_over_a_different_scheme(): void
    {
        Storage::fake('r2');
        config(['filesystems.disks.r2.url' => null]);
        Storage::disk('r2')->put(self::PATH, 'image-bytes');

        $url = MediaUrl::for(self::PATH);

        $this->get(str_replace('http://', 'https://', $url))->assertOk();
    }

    /**
     * The origin comes from the request, never from `APP_URL`. On these
     * deployments `APP_URL` has pointed at the *frontend*, and a media link on
     * that origin is answered by the SPA's index.html — so every image and PDF
     * renders as the login page instead of the file.
     */
    public function test_the_origin_comes_from_the_request_not_app_url(): void
    {
        Storage::fake('r2');
        config([
            'filesystems.disks.r2.url' => null,
            'app.url' => 'https://app.example.test',
        ]);
        Storage::disk('r2')->put(self::PATH, 'image-bytes');

        $url = MediaUrl::for(self::PATH);

        $this->assertStringNotContainsString('app.example.test', $url);
        $this->assertSame(request()->getHttpHost(), parse_url($url, PHP_URL_HOST).':'.parse_url($url, PHP_URL_PORT));
    }

    /**
     * Assessment content stores the finished URL, so moving the API to a new
     * domain must not invalidate the signatures already embedded in it. The
     * origin needs repointing — that is what `media:repair-urls` does — but the
     * signature itself stays good.
     */
    public function test_a_link_survives_a_move_to_a_new_domain(): void
    {
        Storage::fake('r2');
        config(['filesystems.disks.r2.url' => null]);
        Storage::disk('r2')->put(self::PATH, 'image-bytes');

        MediaUrl::forceOrigin('https://old.example.test');
        $minted = MediaUrl::for(self::PATH);
        MediaUrl::forceOrigin(null);

        $this->assertStringStartsWith('https://old.example.test/', $minted);
        $this->assertTrue(MediaUrl::isOurs($minted));

        // Same signature, served on the origin the API answers on today.
        $this->get(str_replace('https://old.example.test', '', $minted))->assertOk();
    }

    /**
     * `--origin=` exists so stored content can be repointed at the real API
     * origin without first correcting `APP_URL` on the server.
     */
    public function test_an_explicit_origin_overrides_everything_else(): void
    {
        config(['filesystems.disks.r2.url' => null]);

        MediaUrl::forceOrigin('https://api.example.test/');
        try {
            $this->assertStringStartsWith('https://api.example.test/api/media', MediaUrl::for(self::PATH));
        } finally {
            MediaUrl::forceOrigin(null);
        }
    }

    /**
     * Links minted before signatures went relative are still stored in content
     * and must keep working on the origin they were signed for.
     */
    public function test_legacy_absolute_signatures_are_still_accepted(): void
    {
        Storage::fake('r2');
        config([
            'filesystems.disks.r2.url' => null,
            'app.url' => 'http://localhost',
        ]);
        Storage::disk('r2')->put(self::PATH, 'image-bytes');

        $legacy = URL::signedRoute('media.show', ['path' => self::PATH]);

        $this->get($legacy)->assertOk();
    }

    /**
     * Relative signing must not weaken the check: swapping the object key still
     * has to be rejected, and so does a signature borrowed from another key.
     */
    public function test_relative_signing_still_rejects_a_swapped_key(): void
    {
        Storage::fake('r2');
        config(['filesystems.disks.r2.url' => null]);
        Storage::disk('r2')->put(self::PATH, 'image-bytes');
        Storage::disk('r2')->put('inst-2/secrets/private.png', 'not-yours');

        $url = MediaUrl::for(self::PATH);

        $this->get(str_replace(rawurlencode(self::PATH), rawurlencode('inst-2/secrets/private.png'), $url))
            ->assertForbidden();
        $this->get('/api/media?path='.rawurlencode('inst-2/secrets/private.png'))
            ->assertForbidden();
    }

    /**
     * `media:repair-urls` walks every string in a content tree and gates on
     * `isOurs()`, so this is what keeps it from rewriting question text, answer
     * choices and embedded third-party links into media URLs.
     */
    public function test_only_links_we_handed_out_are_claimed(): void
    {
        config(['filesystems.disks.r2.url' => null]);

        $this->assertTrue(MediaUrl::isOurs(MediaUrl::for(self::PATH)));
        $this->assertTrue(MediaUrl::isOurs(
            'https://bucket.acct.r2.cloudflarestorage.com/'.self::PATH.'?X-Amz-Expires=604800&X-Amz-Signature=abc'
        ));

        // Not ours: third-party embeds, bare answer choices, and anything that
        // merely happens to carry a `path` query parameter.
        $this->assertFalse(MediaUrl::isOurs('https://www.youtube.com/watch?v=abc123'));
        $this->assertFalse(MediaUrl::isOurs('https://example.test/download?path=secret.png'));
        $this->assertFalse(MediaUrl::isOurs(self::PATH));
        $this->assertFalse(MediaUrl::isOurs('A'));
        $this->assertFalse(MediaUrl::isOurs('The sum of two negative integers'));
        $this->assertFalse(MediaUrl::isOurs(null));

        config(['filesystems.disks.r2.url' => 'https://cdn.example.test']);
        $this->assertTrue(MediaUrl::isOurs('https://cdn.example.test/'.self::PATH));
    }
}
