<?php

namespace App\Console\Commands;

use App\Models\AdmissionFormSubmission;
use App\Models\Student;
use App\Support\AdmissionPayloadMapper;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BackfillStudentAdmissionRecords extends Command
{
    /**
     * Usage:
     *   php artisan students:backfill-admission-records
     *   php artisan students:backfill-admission-records --dry-run
     */
    protected $signature = 'students:backfill-admission-records {--dry-run : Report what would change without writing}';

    protected $description = 'Populate normalized student records (profile, guardians, emergency contacts, health) from already-accepted admission submissions.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $query = AdmissionFormSubmission::query()
            ->where('status', 'accepted')
            ->whereNotNull('student_id');

        $total = $query->count();
        if ($total === 0) {
            $this->info('No accepted submissions with a linked student found. Nothing to backfill.');

            return self::SUCCESS;
        }

        $this->info(($dryRun ? '[DRY RUN] ' : '') . "Processing {$total} accepted submission(s)...");

        $synced = 0;
        $skipped = 0;

        $query->orderBy('created_at')->chunkById(100, function ($submissions) use (&$synced, &$skipped, $dryRun) {
            foreach ($submissions as $submission) {
                $student = Student::find($submission->student_id);
                if (! $student) {
                    $this->warn("  - Submission {$submission->id}: linked student {$submission->student_id} not found, skipping.");
                    $skipped++;
                    continue;
                }

                if ($dryRun) {
                    $this->line("  - Would sync student {$student->id} from submission {$submission->id}.");
                    $synced++;
                    continue;
                }

                DB::transaction(function () use ($student, $submission) {
                    AdmissionPayloadMapper::syncToStudent($student, $submission->payload ?? []);
                });
                $synced++;
            }
        });

        $this->newLine();
        $this->info(($dryRun ? '[DRY RUN] ' : '') . "Done. Synced: {$synced}, Skipped: {$skipped}.");

        return self::SUCCESS;
    }
}
