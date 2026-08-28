<?php

namespace App\Services;

use App\Models\GateSmsSetting;
use App\Models\Institution;
use App\Models\RfidScanLog;
use App\Models\Student;
use App\Models\StudentSection;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Log;

/**
 * Turns a gate scan (rfid_scan_logs row) into a queued SMS to the student's
 * contact number, using the per-gate template + gateway configured for the
 * institution. Never throws — a gate scan must never fail because of SMS.
 */
class GateSmsNotifier
{
    /**
     * Placeholders a message_template may use, in the order they are shown in the UI.
     */
    public const VARIABLES = [
        '{student_name}',
        '{first_name}',
        '{last_name}',
        '{lrn}',
        '{grade_level}',
        '{section}',
        '{gate}',
        '{time}',
        '{date}',
        '{school}',
    ];

    public function __construct(private SmsService $sms) {}

    /**
     * @return string[] IDs of the queued messages (empty when nothing was sent)
     */
    public function notify(RfidScanLog $log): array
    {
        try {
            return $this->send($log);
        } catch (\Throwable $e) {
            Log::warning('Gate SMS notification failed', [
                'scan_log_id' => $log->id,
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    private function send(RfidScanLog $log): array
    {
        $setting = GateSmsSetting::where('institution_id', $log->institution_id)
            ->where('gate_type', $log->type)
            ->first();

        if (! $setting || ! $setting->is_enabled) {
            return [];
        }

        // Before anything else, because a backlog flush arrives here in bulk and
        // this is the cheapest way to say no.
        if ($this->tooLate($log, (int) $setting->late_threshold_minutes)) {
            return [];
        }

        // Load fresh copies rather than hydrating relations onto $log — kioskScan
        // serializes that same model into a public, unauthenticated response, and
        // the profile carries the contact number.
        $student = Student::with('profile')->find($log->student_id);
        $institution = Institution::find($log->institution_id);

        $number = trim((string) ($student?->profile?->mobile_number ?? ''));
        if ($number === '') {
            Log::info('Gate SMS skipped — student has no mobile number on their background record', [
                'scan_log_id' => $log->id,
                'student_id' => $log->student_id,
            ]);

            return [];
        }

        if ($this->withinCooldown($log, $setting->cooldown_minutes)) {
            return [];
        }

        $body = $this->render($setting->message_template, $log, $student, $institution, $setting->timezone);
        if (trim($body) === '') {
            return [];
        }

        return $this->sms->queue($log->institution_id, $number, $body, [
            'source' => 'gate',
            'source_type' => RfidScanLog::class,
            'source_id' => $log->id,
            'gateway_id' => $setting->sms_gateway_id,
        ]);
    }

    /**
     * A scan old enough that telling a parent about it now would misinform them.
     *
     * Notifications fire on insert, and a kiosk that spent the morning offline
     * inserts the morning all at once. "Your child has entered school" sent at
     * 3pm about a 7am tap is not a late notification, it is a false one — and the
     * school cannot un-send it. The scan itself is still recorded; only the text
     * is dropped, and loudly enough to be found in the log.
     *
     * Measured against the *server's* clock deliberately: `scanned_at` may have
     * come from a device that had no idea what time it was.
     */
    private function tooLate(RfidScanLog $log, int $minutes): bool
    {
        if ($minutes <= 0) {
            return false;
        }

        $scannedAt = $log->scanned_at instanceof CarbonInterface ? $log->scanned_at : null;
        if ($scannedAt === null) {
            return false;
        }

        $lateBy = $scannedAt->diffInMinutes(now(), false);

        if ($lateBy <= $minutes) {
            return false;
        }

        Log::info('Gate SMS skipped — scan reached the server too late to be worth sending', [
            'scan_log_id' => $log->id,
            'scanned_at' => $scannedAt->toISOString(),
            'late_by_minutes' => $lateBy,
            'threshold_minutes' => $minutes,
        ]);

        return true;
    }

    /**
     * Suppress a repeat notification when the same student re-taps the same gate
     * inside the configured window (badge double-taps, students loitering at the reader).
     */
    private function withinCooldown(RfidScanLog $log, int $minutes): bool
    {
        if ($minutes <= 0) {
            return false;
        }

        return RfidScanLog::where('institution_id', $log->institution_id)
            ->where('student_id', $log->student_id)
            ->where('type', $log->type)
            ->where('id', '!=', $log->id)
            ->where('scanned_at', '>=', $log->scanned_at->copy()->subMinutes($minutes))
            ->where('scanned_at', '<=', $log->scanned_at)
            ->exists();
    }

    private function render(
        string $template,
        RfidScanLog $log,
        ?Student $student,
        ?Institution $institution,
        ?string $timezone,
    ): string {
        $scannedAt = $log->scanned_at instanceof CarbonInterface ? $log->scanned_at->copy() : now();

        if ($timezone) {
            try {
                $scannedAt = $scannedAt->setTimezone($timezone);
            } catch (\Throwable) {
                // Invalid tz saved in settings — fall back to the app timezone rather than failing the send.
            }
        }

        $section = StudentSection::with('classSection')
            ->where('student_id', $log->student_id)
            ->where('is_active', true)
            ->latest()
            ->first()
            ?->classSection;

        // Prefer the abbreviation — SMS segments are 160 chars and schools set a short form.
        $school = trim((string) ($institution?->abbr ?? ''));
        if ($school === '') {
            $school = (string) ($institution?->title ?? '');
        }

        $fullName = collect([
            $student?->first_name,
            $student?->middle_name,
            $student?->last_name,
            $student?->ext_name,
        ])->filter()->implode(' ');

        $replacements = [
            '{student_name}' => $fullName,
            '{first_name}' => (string) ($student?->first_name ?? ''),
            '{last_name}' => (string) ($student?->last_name ?? ''),
            '{lrn}' => (string) ($student?->lrn ?? ''),
            '{grade_level}' => (string) ($section?->grade_level ?? ''),
            '{section}' => (string) ($section?->title ?? ''),
            '{gate}' => (string) ($log->device_name ?? ($log->type === 'exit' ? 'Exit Gate' : 'Entrance Gate')),
            '{time}' => $scannedAt->format('g:i A'),
            '{date}' => $scannedAt->format('M j, Y'),
            '{school}' => $school,
        ];

        return trim(strtr($template, $replacements));
    }
}
