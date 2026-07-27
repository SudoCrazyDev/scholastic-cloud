<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

/**
 * Permanent URLs for objects stored on the R2 disk.
 *
 * Uploads used to be handed out as presigned S3 URLs (`temporaryUrl`), which
 * expire after at most 7 days — so images embedded in assessment questions and
 * files attached to lessons silently turned into broken links. Every URL built
 * here is non-expiring:
 *
 *  - When the bucket has a public domain configured (`R2_URL`), that public URL
 *    is used directly.
 *  - Otherwise the object is served through this app's `media.show` route using
 *    a *signed* URL with no expiration. The signature is an HMAC over the URL
 *    with the app key, so the link cannot be forged or edited to reach another
 *    object, but it also never goes stale.
 *
 * NOTE: signed URLs are absolute and built from `APP_URL`, so that value must
 * point at the public API origin in every deployed environment.
 */
class MediaUrl
{
    /**
     * Permanent, publicly-fetchable URL for an object key on the r2 disk.
     */
    public static function for(?string $path): ?string
    {
        $path = trim((string) $path);
        if ($path === '') {
            return null;
        }

        $publicBase = config('filesystems.disks.r2.url');
        if ($publicBase) {
            return rtrim($publicBase, '/').'/'.ltrim($path, '/');
        }

        try {
            return URL::signedRoute('media.show', ['path' => $path]);
        } catch (\Throwable) {
            // Last resort: whatever the disk can produce. Better a URL than null.
            try {
                return Storage::disk('r2')->url($path);
            } catch (\Throwable) {
                return null;
            }
        }
    }

    /**
     * Best-effort reverse mapping: any URL this app has ever handed out for an
     * R2 object back to that object's key. Understands the signed media route,
     * the public bucket domain, and legacy presigned S3/R2 URLs. Returns null
     * when the value clearly is not one of ours (e.g. a YouTube link).
     */
    public static function pathFrom(?string $url): ?string
    {
        $url = trim((string) $url);
        if ($url === '') {
            return null;
        }

        // Already a bare object key.
        if (! preg_match('#^https?://#i', $url)) {
            return self::clean($url);
        }

        $parts = parse_url($url);
        if ($parts === false) {
            return null;
        }

        // Our signed media route carries the key in the `path` query parameter.
        if (! empty($parts['query'])) {
            parse_str($parts['query'], $query);
            if (! empty($query['path'])) {
                return self::clean((string) $query['path']);
            }
        }

        $publicBase = config('filesystems.disks.r2.url');
        if ($publicBase && str_starts_with($url, rtrim($publicBase, '/').'/')) {
            return self::clean(substr($url, strlen(rtrim($publicBase, '/')) + 1));
        }

        $host = $parts['host'] ?? '';
        $path = ltrim($parts['path'] ?? '', '/');
        if ($path === '') {
            return null;
        }

        // Legacy presigned URL: https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-...
        // (or the path-style S3 equivalent). Drop the bucket segment when present.
        $bucket = (string) config('filesystems.disks.r2.bucket');
        if ($bucket !== '' && str_starts_with($path, $bucket.'/')) {
            $path = substr($path, strlen($bucket) + 1);
        }

        // Only claim URLs that look like object storage; anything else is a
        // third-party link we must not touch.
        if (! str_contains($host, 'r2.cloudflarestorage.com') && ! str_contains($host, 'amazonaws.com')) {
            return null;
        }

        return self::clean(rawurldecode($path));
    }

    /**
     * Delete an object previously handed out under `$url`, ignoring anything
     * that is not one of our own R2 objects. Used to drop the old file when a
     * teacher re-uploads over an existing image or attachment.
     */
    public static function deleteByUrl(?string $url): bool
    {
        $path = self::pathFrom($url);

        return $path ? self::deleteByPath($path) : false;
    }

    /**
     * Delete an object by its R2 key. Never throws — cleanup must not fail the
     * request that triggered it.
     */
    public static function deleteByPath(?string $path): bool
    {
        $path = self::clean((string) $path);
        if ($path === null) {
            return false;
        }

        try {
            return Storage::disk('r2')->delete($path);
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Reject empty keys and any attempt at path traversal.
     */
    public static function clean(?string $path): ?string
    {
        $path = ltrim(trim((string) $path), '/');
        if ($path === '' || str_contains($path, '..')) {
            return null;
        }

        return $path;
    }
}
