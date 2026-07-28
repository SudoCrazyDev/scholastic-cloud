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
 * The signature deliberately covers only the *path and query* — never the
 * scheme or host. Assessment content stores the finished URL, so an
 * origin-bound signature breaks the moment the origin as Laravel sees it stops
 * matching the one the URL was minted under, which happens routinely:
 *
 *  - TLS terminated at a proxy that forwards plain HTTP (no trusted proxies
 *    configured), so the URL says `https` but `$request->url()` says `http`;
 *  - the API moving to a new domain, which invalidates every URL already
 *    embedded in a question or lesson.
 *
 * Signing relatively makes the link survive both. `APP_URL` still supplies the
 * origin the URL is handed out under, so it must point at the public API origin
 * in every deployed environment — but getting it wrong now only misdirects new
 * URLs instead of silently invalidating old ones, and `media:repair-urls`
 * re-points stored content afterwards.
 */
class MediaUrl
{
    /**
     * Origin to write into links instead of the one derived from the request or
     * `APP_URL`. Set by `media:repair-urls --origin=` so stored content can be
     * repointed at the real API origin without first correcting `APP_URL`.
     */
    private static ?string $originOverride = null;

    public static function forceOrigin(?string $origin): void
    {
        $origin = rtrim(trim((string) $origin), '/');
        self::$originOverride = $origin === '' ? null : $origin;
    }

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
            // absolute: false — sign the path+query only; see the class docblock.
            return self::origin().URL::signedRoute('media.show', ['path' => $path], null, false);
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
     * The origin signed media links are handed out under. Absolute, because the
     * links are embedded in pages served from the frontend's own origin.
     *
     * Taken from the incoming request, not from `APP_URL`. The request's own
     * root is the one origin guaranteed to reach this API — it is how the caller
     * just reached it — whereas `APP_URL` is routinely stale or, on these
     * deployments, points at the *frontend*, which answers with the SPA's
     * index.html and makes every image and PDF render as the login page.
     *
     * Console and queue runs have no real request, but Laravel builds one from
     * `APP_URL` for them, so that stays the fallback there.
     */
    private static function origin(): string
    {
        if (self::$originOverride !== null) {
            return self::$originOverride;
        }

        $root = rtrim((string) (request()?->root() ?: ''), '/');
        if ($root === '') {
            return rtrim((string) config('app.url'), '/');
        }

        // A proxy that terminates TLS and forwards plain HTTP makes the request
        // look insecure. The signature no longer covers the scheme, so this is
        // not a correctness problem — but an http link inside an https page is
        // blocked as mixed content, so a declared https origin wins.
        if (str_starts_with($root, 'http://') && str_starts_with((string) config('app.url'), 'https://')) {
            $root = 'https://'.substr($root, strlen('http://'));
        }

        return $root;
    }

    /**
     * True when `$url` is one of our own `media.show` links but was minted for a
     * different origin than the one we hand out today — i.e. content carried
     * over from a previous domain, or from a run with a stale `APP_URL`. Such a
     * URL still resolves to a valid object key, it just points somewhere the
     * browser can no longer reach.
     */
    public static function isStaleMediaUrl(?string $url): bool
    {
        $url = trim((string) $url);
        if ($url === '' || ! preg_match('#^https?://#i', $url)) {
            return false;
        }

        $parts = parse_url($url);
        if ($parts === false || empty($parts['query'])) {
            return false;
        }

        parse_str($parts['query'], $query);
        if (empty($query['path']) || empty($query['signature'])) {
            return false;
        }

        $origin = ($parts['scheme'] ?? '').'://'.($parts['host'] ?? '')
            .(isset($parts['port']) ? ':'.$parts['port'] : '');

        return $origin !== self::origin();
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
