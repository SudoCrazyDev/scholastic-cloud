<?php

use App\Models\AdmissionFormSubmission;
use App\Models\Student;
use App\Support\AdmissionPayloadMapper;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * One-time data backfill: populate the normalized student records
 * (profile, guardians, emergency contacts, health) from admission
 * submissions that were already accepted before these tables existed.
 *
 * Runs exactly once per database via the standard deploy `migrate --force`.
 * It does NOT run on subsequent deploys, so it will never clobber edits
 * staff make to these records afterward. For ad-hoc re-runs use:
 *   php artisan students:backfill-admission-records
 */
return new class extends Migration
{
    public function up(): void
    {
        AdmissionFormSubmission::query()
            ->where('status', 'accepted')
            ->whereNotNull('student_id')
            ->orderBy('created_at')
            ->chunkById(100, function ($submissions) {
                foreach ($submissions as $submission) {
                    try {
                        $student = Student::find($submission->student_id);
                        if (! $student) {
                            continue;
                        }
                        DB::transaction(function () use ($student, $submission) {
                            AdmissionPayloadMapper::syncToStudent($student, $submission->payload ?? []);
                        });
                    } catch (\Throwable $e) {
                        // Never let one bad record fail the deploy migration.
                        Log::warning('Admission backfill skipped submission ' . $submission->id . ': ' . $e->getMessage());
                    }
                }
            });
    }

    public function down(): void
    {
        // Irreversible data migration. The normalized tables are dropped by
        // their own create-table migrations' down() if a full rollback is needed.
    }
};
