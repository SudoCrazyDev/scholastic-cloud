<?php

namespace App\Http\Controllers;

use App\Models\GateDevice;
use App\Models\GateUnresolvedScan;
use App\Models\RfidScanLog;
use App\Models\Student;
use App\Models\StudentRfidTag;
use App\Models\StudentSection;
use App\Services\GatePhotoThumbnail;
use App\Services\GateRosterSnapshot;
use App\Services\GateSmsNotifier;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Device-facing endpoints for a gate kiosk: a public pairing exchange plus a
 * token-guarded surface the kiosk page calls. Mirrors SmsBridgeController.
 *
 * The kiosk here is a browser, not a daemon — the "device" is Chromium's
 * `localStorage` on a Pi. That makes the token no more secret than the machine
 * it sits on, which is why the roster this token will later unlock carries no
 * contact numbers and no LRNs, and why revocation is a portal button.
 */
class GateKioskController extends Controller
{
    /**
     * Rows one upload may carry. Bounded so a kiosk returning from a long
     * outage sends its backlog as several answered batches rather than one
     * request that has to survive end to end on the link that caused it.
     */
    public const MAX_SCANS_PER_BATCH = 200;

    /**
     * Exchange a one-time pairing code for a long-lived device token. Sent once,
     * from the kiosk's pairing screen, after an admin registers the device.
     */
    public function pair(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'pairing_code' => 'required|string',
            'app_version' => 'nullable|string|max:64',
        ]);

        $device = GateDevice::where('pairing_code', $validated['pairing_code'])
            ->whereNotNull('pairing_code_expires_at')
            ->where('pairing_code_expires_at', '>', now())
            ->whereNull('device_token_hash') // an already-paired device cannot re-pair with a code
            ->first();

        if (! $device) {
            return response()->json(['message' => 'Invalid or expired pairing code'], 422);
        }

        $plainToken = Str::random(64);

        $device->update([
            'device_token_hash' => hash('sha256', $plainToken),
            'pairing_code' => null,
            'pairing_code_expires_at' => null,
            'app_version' => $validated['app_version'] ?? $device->app_version,
        ]);

        return response()->json([
            'success' => true,
            // Handed out once and never again — the kiosk stores it locally.
            'token' => $plainToken,
            'device' => $this->deviceIdentity($device->fresh()),
            // The kiosk starts correcting its clock from its very first call,
            // before it has ever heartbeated. See heartbeat() for why.
            'server_time' => now()->toISOString(),
        ]);
    }

    /**
     * Presence plus whatever the device knows about its own local copy.
     *
     * Also the kiosk's clock reference. A Pi has no RTC: booted without a
     * network it can be hours out, and every scan it queues would carry that
     * error into `rfid_scan_logs`, where the day is what attendance is read
     * from. Answering with the server's time here is what lets the device
     * stamp queued scans with a corrected clock rather than its own.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        /** @var GateDevice $device */
        $device = $request->attributes->get('gate_device');

        $validated = $request->validate([
            'roster_count' => 'nullable|integer|min:0',
            'pending_count' => 'nullable|integer|min:0',
            'clock_offset_ms' => 'nullable|integer',
            'last_sync_at' => 'nullable|date',
            'app_version' => 'nullable|string|max:64',
        ]);

        $device->update([
            'last_seen_at' => now(),
            // Reported values are replaced only when sent: a heartbeat that
            // omits one must not blank what the portal already knows.
            'roster_count' => $validated['roster_count'] ?? $device->roster_count,
            'pending_count' => $validated['pending_count'] ?? $device->pending_count,
            'clock_offset_ms' => $validated['clock_offset_ms'] ?? $device->clock_offset_ms,
            'last_sync_at' => $validated['last_sync_at'] ?? $device->last_sync_at,
            'app_version' => $validated['app_version'] ?? $device->app_version,
        ]);

        return response()->json([
            'success' => true,
            'server_time' => now()->toISOString(),
            'device' => $this->deviceIdentity($device->fresh()),
        ]);
    }

    /**
     * One page of the roster this kiosk should hold locally.
     *
     * Omit `since` for a full snapshot (the response says `full`, and the kiosk
     * prunes anything absent from it — that is how a hard-deleted student
     * eventually disappears). Pass the `synced_at` from the previous sync to get
     * only what changed, plus `removed_ids` for students who left.
     *
     * Small on purpose: names, section, tag UIDs, and a photo *hash*. No mobile
     * numbers and no LRNs — this data ends up on an SD card at a gate, so it
     * carries only what the kiosk actually draws on screen.
     */
    public function roster(Request $request, GateRosterSnapshot $snapshot): JsonResponse
    {
        /** @var GateDevice $device */
        $device = $request->attributes->get('gate_device');

        $validated = $request->validate([
            'since' => 'nullable|date',
            'cursor' => 'nullable|string|max:128',
            'limit' => 'nullable|integer|min:1|max:'.GateRosterSnapshot::MAX_LIMIT,
        ]);

        $page = $snapshot->page(
            $device,
            $validated['since'] ?? null,
            $validated['cursor'] ?? null,
            (int) ($validated['limit'] ?? GateRosterSnapshot::DEFAULT_LIMIT),
        );

        return response()->json(['success' => true] + $page);
    }

    /**
     * A student's photo, small enough to keep 3,000 of them on a Pi.
     *
     * Served from the API rather than handed over as an R2 URL, and that is not
     * a detail: `api/*` allows every origin, while the bucket's public domain
     * sends no CORS headers. A no-CORS fetch is opaque, and opaque bytes cannot
     * be read into a Blob for IndexedDB at all — so the URL that works fine in
     * an `<img>` tag is useless for building an offline cache.
     *
     * The response is immutable: the URL is only ever reached for a student
     * whose `photo_hash` the kiosk just read, and a new photo means a new hash.
     */
    public function photo(Request $request, string $student, GatePhotoThumbnail $photos): Response
    {
        /** @var GateDevice $device */
        $device = $request->attributes->get('gate_device');

        $record = Student::whereKey($student)
            // Scoped even though the id came from this device's own roster: a
            // token must not be able to read a neighbouring school's photos by
            // guessing UUIDs. Enrolment `is_active` is deliberately not checked
            // — a student unenrolled mid-sync should 404 on the roster's next
            // pass, not mid-download.
            ->whereHas('studentInstitutions', fn ($query) => $query->where('institution_id', $device->institution_id))
            ->first();

        if (! $record) {
            return response('Not found', 404);
        }

        $photo = $photos->bytesFor($record);

        if ($photo === null) {
            return response('No photo', 404);
        }

        $etag = '"'.$photo['hash'].'"';

        // A device re-syncing after a wipe re-requests photos it may still hold
        // in its HTTP cache; 304 makes that free.
        if (trim((string) $request->header('If-None-Match')) === $etag) {
            return response('', 304)->header('ETag', $etag);
        }

        return response($photo['bytes'], 200)
            ->header('Content-Type', $photo['mime'])
            ->header('Content-Length', (string) strlen($photo['bytes']))
            ->header('ETag', $etag)
            ->header('Cache-Control', 'public, max-age=31536000, immutable')
            // Lets a kiosk log why a sync was heavier than expected.
            ->header('X-Gate-Photo-Resized', $photo['resized'] ? '1' : '0');
    }

    /**
     * Upload scans a kiosk has been holding. **This is the write path.**
     *
     * Everything here exists because the upload can fail halfway. A device sends
     * a batch, the reply is lost on the way back, and the device — correctly —
     * sends the same rows again. So each row carries a `client_scan_id` the
     * device made up and keeps until it is acknowledged, and this endpoint is
     * idempotent on it: a row already recorded comes back `duplicate` rather than
     * being recorded twice. Attendance that double-counts is worse than
     * attendance that is late.
     *
     * Every row is answered individually — `accepted`, `duplicate` or `rejected`
     * — because the device deletes a queued scan only on an answer about *that*
     * scan. A row this endpoint says nothing about stays queued and is sent
     * again, which is what makes a partial failure safe.
     *
     * **The device does not get to say who tapped.** It sends the raw UID and the
     * server resolves it, the same way `kioskScan` does, for two reasons: the
     * device's roster may be stale — a card issued after its last sync is unknown
     * to it and perfectly known here, which is why an unrecognised tap is queued
     * rather than dropped — and a kiosk on a wall is not a trustworthy source for
     * "this scan belongs to student X".
     */
    public function scans(Request $request): JsonResponse
    {
        /** @var GateDevice $device */
        $device = $request->attributes->get('gate_device');

        $validated = $request->validate([
            'scans' => 'required|array|min:1|max:'.self::MAX_SCANS_PER_BATCH,
            'scans.*.client_scan_id' => 'required|string|max:64',
            'scans.*.rfid_uid' => 'required|string|max:255',
            'scans.*.scanned_at' => 'required|date',
            // Only consulted for a `both` gate; a single-direction device is told
            // what it is by its own token.
            'scans.*.type' => 'nullable|in:enter,exit',
            'scans.*.clock_suspect' => 'nullable|boolean',
            'pending_count' => 'nullable|integer|min:0',
        ]);

        $items = $validated['scans'];

        // One lookup for the whole batch rather than a query per row: this is the
        // retry path, so on a bad link much of a batch may already be recorded.
        $already = RfidScanLog::where('institution_id', $device->institution_id)
            ->whereIn('client_scan_id', array_column($items, 'client_scan_id'))
            ->pluck('id', 'client_scan_id');

        $results = [];
        $accepted = 0;

        // A one-row upload is the tap someone is standing in front of; anything
        // larger is a backlog draining behind the scenes. Only the former has a
        // screen waiting on a name, so only the former pays for looking one up.
        $describe = count($items) === 1;

        foreach ($items as $item) {
            $clientId = (string) $item['client_scan_id'];

            if ($already->has($clientId)) {
                $results[] = $this->result(
                    $clientId,
                    'duplicate',
                    logId: $already[$clientId],
                    student: $describe ? $this->describeStudent(
                        RfidScanLog::find($already[$clientId])?->student_id
                    ) : null,
                );

                continue;
            }

            $type = $this->directionFor($device, $item);

            if ($type === null) {
                // A `both` gate that did not say which way the student went. A
                // guess here would quietly corrupt attendance, so it is refused.
                $results[] = $this->result($clientId, 'rejected', reason: 'gate_type_required');

                continue;
            }

            $scannedAt = Carbon::parse($item['scanned_at']);
            $resolved = $this->resolveTap($device, (string) $item['rfid_uid']);

            if ($resolved === null) {
                // Terminal for the device: it stops retrying, because a card
                // nobody can place will not resolve on the tenth attempt either.
                // So the tap is written where a person will see it — almost
                // always an unregistered or replaced card the office can fix.
                GateUnresolvedScan::note([
                    'institution_id' => $device->institution_id,
                    'gate_device_id' => $device->id,
                    'rfid_uid' => (string) $item['rfid_uid'],
                    'type' => $type,
                    'device_name' => $device->name,
                    'last_seen_at' => $scannedAt,
                    'clock_suspect' => $this->clockSuspect($item, $scannedAt),
                ]);

                Log::info('Gate scan could not be resolved at ingest', [
                    'device_id' => $device->id,
                    'institution_id' => $device->institution_id,
                    'rfid_uid' => $item['rfid_uid'],
                    'scanned_at' => $item['scanned_at'],
                ]);

                $results[] = $this->result($clientId, 'rejected', reason: 'unknown_tag');

                continue;
            }

            try {
                $log = RfidScanLog::create([
                    'student_rfid_tag_id' => $resolved['tag_id'],
                    'student_id' => $resolved['student_id'],
                    'institution_id' => $device->institution_id,
                    'scanned_at' => $scannedAt,
                    'type' => $type,
                    // From the token, not the request: this is the name the
                    // portal shows beside the scan.
                    'device_name' => $device->name,
                    'client_scan_id' => $clientId,
                    'clock_suspect' => $this->clockSuspect($item, $scannedAt),
                ]);
            } catch (QueryException $e) {
                if ($this->isDuplicateKey($e)) {
                    // Two flushes of the same queue overlapped. The unique index
                    // is the arbiter; the row exists, so the device is done.
                    $existing = RfidScanLog::where('institution_id', $device->institution_id)
                        ->where('client_scan_id', $clientId)
                        ->value('id');

                    $results[] = $this->result($clientId, 'duplicate', logId: $existing);

                    continue;
                }

                // One unwritable row must not cost the device the rest of the
                // batch, so it is reported and the loop carries on.
                Log::warning('Gate scan could not be recorded', [
                    'device_id' => $device->id,
                    'client_scan_id' => $clientId,
                    'error' => $e->getMessage(),
                ]);

                $results[] = $this->result($clientId, 'rejected', reason: 'server_error');

                continue;
            }

            // This card works now, so it no longer belongs on the worklist —
            // registering the tag is exactly the fix that list exists to prompt.
            GateUnresolvedScan::where('institution_id', $device->institution_id)
                ->where('rfid_uid', (string) $item['rfid_uid'])
                ->delete();

            // Best effort and never throws — see GateSmsNotifier, which also
            // decides for itself whether a scan this old is still worth a text.
            app(GateSmsNotifier::class)->notify($log);

            $accepted++;
            $results[] = $this->result(
                $clientId,
                'accepted',
                logId: $log->id,
                student: $describe ? $this->describeStudent($log->student_id) : null,
            );
        }

        $device->update([
            'last_seen_at' => now(),
            // What the device still holds after this batch — it knows and we do
            // not, so the portal is not stale between heartbeats.
            'pending_count' => $validated['pending_count'] ?? $device->pending_count,
        ]);

        return response()->json([
            'success' => true,
            'accepted' => $accepted,
            'results' => $results,
            'server_time' => now()->toISOString(),
        ]);
    }

    /**
     * Which direction this scan records.
     *
     * A single-direction device is not asked — its token says what it is. A
     * `both` device has to say, per scan, and gets no default.
     *
     * @param  array<string, mixed>  $item
     */
    private function directionFor(GateDevice $device, array $item): ?string
    {
        if ($device->gate_type !== 'both') {
            return $device->gate_type;
        }

        $type = $item['type'] ?? null;

        return in_array($type, ['enter', 'exit'], true) ? $type : null;
    }

    /**
     * The student behind a scanned value, or null when there isn't one.
     *
     * Reproduces `RfidScanLogController::kioskScan`: an active tag UID first, then
     * the QR fallback that treats the value as the student's own UUID. It has to
     * stay reproduced — a kiosk resolves taps locally against its roster, and a
     * rule that differs here is a gate that says "welcome" to a scan the server
     * then refuses.
     *
     * **One deliberate difference.** `kioskScan`'s tag lookup checks no
     * institution at all, so a neighbouring school's card resolves at any gate.
     * This endpoint requires an active enrolment in the device's own institution
     * on both paths: it is the roster this has to agree with and the roster is
     * institution-scoped, and recording a stranger's tap here would put another
     * school's student in this school's gate log.
     *
     * @return array{student_id: string, tag_id: ?string}|null
     */
    private function resolveTap(GateDevice $device, string $scanned): ?array
    {
        $value = trim($scanned);

        if ($value === '') {
            return null;
        }

        $tag = StudentRfidTag::where('rfid_uid', $value)
            ->where('is_active', true)
            ->first();

        if ($tag && $this->enrolledHere($device, $tag->student_id)) {
            return ['student_id' => $tag->student_id, 'tag_id' => $tag->id];
        }

        if (Str::isUuid($value)) {
            $student = Student::whereKey($value)
                ->where('is_active', true)
                ->whereHas('studentInstitutions', fn ($query) => $query
                    ->where('institution_id', $device->institution_id)
                    ->where('is_active', true))
                ->first();

            if ($student) {
                return [
                    'student_id' => $student->id,
                    'tag_id' => $student->rfidTag()->where('is_active', true)->value('id'),
                ];
            }
        }

        return null;
    }

    private function enrolledHere(GateDevice $device, string $studentId): bool
    {
        return Student::whereKey($studentId)
            ->where('is_active', true)
            ->whereHas('studentInstitutions', fn ($query) => $query
                ->where('institution_id', $device->institution_id)
                ->where('is_active', true))
            ->exists();
    }

    /**
     * Whether this row's timestamp should be treated as doubtful.
     *
     * The device says so when it has never heard a real clock. The server says so
     * as well when the stamp is in the future by more than plausible flight time:
     * a device with a wrong-but-confident clock does not know to flag itself, and
     * a scan dated tomorrow is the one case that can be caught from here.
     *
     * @param  array<string, mixed>  $item
     */
    private function clockSuspect(array $item, Carbon $scannedAt): bool
    {
        if ((bool) ($item['clock_suspect'] ?? false)) {
            return true;
        }

        return $scannedAt->greaterThan(now()->addMinutes(5));
    }

    /**
     * Just enough about the student to draw the card at the gate.
     *
     * This exists for the tap the device could **not** resolve locally — a card
     * issued after its last roster sync, which is unknown there and known here.
     * Without it the kiosk would have to say "not recognised" about a student the
     * server had just recognised, which is a step backwards from the online-only
     * behaviour it replaces.
     *
     * Deliberately the same fields the roster carries, and no others: no mobile
     * number, no LRN. This response reaches the same SD card the roster does.
     *
     * @return array<string, mixed>|null
     */
    private function describeStudent(?string $studentId): ?array
    {
        if ($studentId === null) {
            return null;
        }

        $student = Student::find($studentId);

        if (! $student) {
            return null;
        }

        // Mirrors kioskScan's `where(is_active)->latest()->first()`.
        $section = StudentSection::with('classSection')
            ->where('student_id', $studentId)
            ->where('is_active', true)
            ->latest()
            ->first()
            ?->classSection;

        return [
            'id' => $student->id,
            'first_name' => $student->first_name,
            'middle_name' => $student->middle_name,
            'last_name' => $student->last_name,
            'ext_name' => $student->ext_name,
            'grade_level' => $section?->grade_level,
            'section' => $section?->title,
        ];
    }

    /**
     * @param  array<string, mixed>|null  $student
     * @return array<string, mixed>
     */
    private function result(
        string $clientId,
        string $status,
        ?string $reason = null,
        ?string $logId = null,
        ?array $student = null,
    ): array {
        return array_filter([
            'client_scan_id' => $clientId,
            'status' => $status,
            'reason' => $reason,
            'scan_log_id' => $logId,
            'student' => $student,
        ], fn ($value) => $value !== null);
    }

    private function isDuplicateKey(QueryException $exception): bool
    {
        // 23000 covers MySQL's 1062 duplicate entry and SQLite's constraint
        // failure alike; the message check keeps it off unrelated 23000s.
        return (string) $exception->getCode() === '23000'
            && Str::contains(Str::lower($exception->getMessage()), ['duplicate', 'unique']);
    }

    /**
     * What the kiosk needs to render itself: which gate it is, and which school.
     * Never the roster, and never anything from the credential columns.
     *
     * @return array<string, mixed>
     */
    private function deviceIdentity(GateDevice $device): array
    {
        return [
            'id' => $device->id,
            'name' => $device->name,
            'location' => $device->location,
            'gate_type' => $device->gate_type,
            'institution_id' => $device->institution_id,
        ];
    }
}
