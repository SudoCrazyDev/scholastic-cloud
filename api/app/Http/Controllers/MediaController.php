<?php

namespace App\Http\Controllers;

use App\Support\MediaUrl;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Serves uploaded files (assessment images, lesson attachments, receipts, …)
 * straight from R2 behind a permanent signed URL.
 *
 * The route is intentionally outside the auth middleware: the URLs are embedded
 * in `<img src>` / `<a href>` and consumed by the browser without the bearer
 * token. The `signed` middleware is what protects it — an unsigned or tampered
 * URL is rejected, so a caller cannot walk the bucket.
 */
class MediaController extends Controller
{
    /** Extension → content type for the handful of things teachers upload. */
    private const MIME_TYPES = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
        'pdf' => 'application/pdf',
        'txt' => 'text/plain',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'mov' => 'video/quicktime',
        'm4v' => 'video/x-m4v',
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'm4a' => 'audio/mp4',
    ];

    public function show(Request $request): StreamedResponse
    {
        $path = MediaUrl::clean($request->query('path'));
        abort_if($path === null, 404);

        $disk = Storage::disk('r2');
        abort_unless($disk->exists($path), 404);

        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $mime = self::MIME_TYPES[$extension] ?? 'application/octet-stream';

        return $disk->response($path, basename($path), [
            'Content-Type' => $mime,
            // Object keys are UUIDs and are never rewritten in place, so the
            // response can be cached hard.
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }
}
