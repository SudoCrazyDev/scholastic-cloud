<?php

namespace App\Services;

use App\Models\Student;
use App\Support\MediaUrl;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Small, cacheable student photos for the gate kiosks.
 *
 * A kiosk holds a photo for every student on its campus. At 3,000+ students the
 * originals — up to 5 MB each, per the upload rule — are gigabytes, which is not
 * a thing you download over the links these schools have. So the kiosk is served
 * a ~256px JPEG instead, generated once and kept on the same R2 disk as the
 * original.
 *
 * Thumbnails are **content-addressed**: the cache key is a hash of the source
 * object key, and profile pictures are written under a fresh UUID on every
 * upload (`StudentController`), so a new photo always means a new hash and never
 * a stale thumbnail. That same hash is what `photo_hash` in the roster carries,
 * which is how a kiosk knows whether it already holds the current photo without
 * downloading anything.
 *
 * **GD is optional.** It is not enabled in every PHP build (it ships with XAMPP
 * commented out), and a gate that shows no faces is far worse than a gate that
 * spends more bandwidth than it should — so when GD is missing the original
 * bytes are served through unchanged, and deliberately *not* cached as a
 * thumbnail, so that enabling GD later produces real thumbnails instead of
 * serving the full-size copies forever.
 */
class GatePhotoThumbnail
{
    /** Longest edge of a generated thumbnail, in pixels. */
    public const MAX_EDGE = 256;

    private const JPEG_QUALITY = 82;

    private const CACHE_PREFIX = 'kiosk-thumbs/';

    /**
     * Decoding is what costs memory: GD holds the *uncompressed* bitmap, roughly
     * width × height × 4 bytes, so a 24-megapixel phone photo wants ~96 MB
     * regardless of how small the JPEG on disk was. Past this budget the resize
     * is skipped rather than risking a fatal that takes the request with it.
     */
    private const DECODE_BUDGET_BYTES = 96 * 1024 * 1024;

    /**
     * The hash a roster row advertises for this student's photo, or null when
     * they have none. Cheap — no object is read to compute it.
     */
    public function hashFor(Student $student): ?string
    {
        $key = $this->sourceKey($student);

        return $key === null ? null : sha1($key);
    }

    /**
     * Bytes to serve for this student's photo, or null when there is nothing to
     * serve. `resized` is false when the original is being passed through.
     *
     * @return array{bytes:string, mime:string, hash:string, resized:bool}|null
     */
    public function bytesFor(Student $student): ?array
    {
        $key = $this->sourceKey($student);
        if ($key === null) {
            return null;
        }

        $hash = sha1($key);
        $cachePath = self::CACHE_PREFIX.$hash.'.jpg';

        $cached = $this->read($cachePath);
        if ($cached !== null) {
            return ['bytes' => $cached, 'mime' => 'image/jpeg', 'hash' => $hash, 'resized' => true];
        }

        $original = $this->read($key);
        if ($original === null) {
            // The row points at an object that is not in the bucket. Not an
            // error worth failing a sync over — the kiosk shows a placeholder.
            Log::info('Gate photo missing from storage', ['student_id' => $student->id, 'key' => $key]);

            return null;
        }

        $thumbnail = $this->resize($original);

        if ($thumbnail === null) {
            return [
                'bytes' => $original,
                'mime' => $this->mimeOf($original),
                'hash' => $hash,
                'resized' => false,
            ];
        }

        // Best effort: a bucket we cannot write to costs us the cache, not the
        // response. Every later request just resizes again.
        try {
            Storage::disk('r2')->put($cachePath, $thumbnail);
        } catch (\Throwable $e) {
            Log::warning('Could not cache gate thumbnail', ['key' => $cachePath, 'error' => $e->getMessage()]);
        }

        return ['bytes' => $thumbnail, 'mime' => 'image/jpeg', 'hash' => $hash, 'resized' => true];
    }

    /**
     * The R2 object key behind a student's photo, or null when there isn't one
     * we can read.
     *
     * `profile_picture` is normally a bare key, but legacy rows hold absolute
     * URLs — presigned R2/S3 links, or links to the media route — so those are
     * mapped back to a key. Anything else (a third-party URL) is left alone and
     * reported as "no photo": the kiosk shows a placeholder rather than this
     * service making outbound HTTP calls during a roster sync.
     */
    private function sourceKey(Student $student): ?string
    {
        $raw = trim((string) $student->getRawOriginal('profile_picture'));
        if ($raw === '') {
            return null;
        }

        if (! preg_match('#^https?://#i', $raw)) {
            return MediaUrl::clean($raw);
        }

        return MediaUrl::pathFrom($raw);
    }

    private function read(string $path): ?string
    {
        try {
            if (! Storage::disk('r2')->exists($path)) {
                return null;
            }

            $contents = Storage::disk('r2')->get($path);

            return $contents === null || $contents === '' ? null : $contents;
        } catch (\Throwable) {
            // R2 answers 403 rather than 404 for a missing key when the token
            // cannot list the bucket, and Flysystem turns that into an
            // exception. "Cannot tell" is treated as "not there".
            return null;
        }
    }

    /**
     * A JPEG no larger than MAX_EDGE on its long side, or null when this build
     * cannot or should not do it.
     */
    private function resize(string $original): ?string
    {
        if (! extension_loaded('gd') || ! function_exists('imagescale')) {
            return null;
        }

        $size = @getimagesizefromstring($original);
        if ($size === false) {
            return null;
        }

        [$width, $height] = $size;
        if ($width < 1 || $height < 1) {
            return null;
        }

        if ($width * $height * 4 > self::DECODE_BUDGET_BYTES) {
            Log::info('Gate photo too large to resize in-process', ['width' => $width, 'height' => $height]);

            return null;
        }

        $image = @imagecreatefromstring($original);
        if ($image === false) {
            return null;
        }

        try {
            $image = $this->applyExifRotation($image, $original);

            $longest = max(imagesx($image), imagesy($image));
            if ($longest > self::MAX_EDGE) {
                $scale = self::MAX_EDGE / $longest;
                $scaled = imagescale(
                    $image,
                    max(1, (int) round(imagesx($image) * $scale)),
                    max(1, (int) round(imagesy($image) * $scale)),
                );

                if ($scaled !== false) {
                    imagedestroy($image);
                    $image = $scaled;
                }
            }

            // PNG and WebP sources can be transparent, and JPEG has no alpha —
            // left alone, transparent pixels encode as black, which turns a
            // cut-out portrait into a silhouette.
            $flattened = imagecreatetruecolor(imagesx($image), imagesy($image));
            imagefill($flattened, 0, 0, imagecolorallocate($flattened, 255, 255, 255));
            imagecopy($flattened, $image, 0, 0, 0, 0, imagesx($image), imagesy($image));
            imagedestroy($image);
            $image = $flattened;

            ob_start();
            $ok = imagejpeg($image, null, self::JPEG_QUALITY);
            $bytes = (string) ob_get_clean();

            return $ok && $bytes !== '' ? $bytes : null;
        } catch (\Throwable $e) {
            Log::warning('Gate thumbnail resize failed', ['error' => $e->getMessage()]);

            return null;
        } finally {
            if ($image instanceof \GdImage) {
                imagedestroy($image);
            }
        }
    }

    /**
     * Honour the EXIF orientation tag before dropping it.
     *
     * Browsers rotate a photo to match this tag on their own, so a portrait shot
     * from a phone already looks upright everywhere else in the app. GD does
     * not, and re-encoding discards the tag — so skipping this step would leave
     * the kiosk as the one screen in the system showing students sideways.
     *
     * @param  \GdImage  $image
     * @return \GdImage
     */
    private function applyExifRotation($image, string $original)
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }

        try {
            // exif_read_data needs a stream; a data: URI avoids a temp file.
            $exif = @exif_read_data('data://image/jpeg;base64,'.base64_encode($original));
        } catch (\Throwable) {
            return $image;
        }

        $orientation = (int) ($exif['Orientation'] ?? 0);

        $degrees = match ($orientation) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };

        if ($degrees === 0) {
            return $image;
        }

        $rotated = @imagerotate($image, $degrees, 0);
        if ($rotated === false) {
            return $image;
        }

        imagedestroy($image);

        return $rotated;
    }

    /** Best-effort content type for bytes being passed through unresized. */
    private function mimeOf(string $bytes): string
    {
        $size = @getimagesizefromstring($bytes);

        return is_array($size) && ! empty($size['mime']) ? (string) $size['mime'] : 'application/octet-stream';
    }
}
