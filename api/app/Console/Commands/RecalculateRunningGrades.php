<?php

namespace App\Console\Commands;

use App\Services\RunningGradeRecalcService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class RecalculateRunningGrades extends Command
{
    /**
     * Usage:
     *   php artisan grades:recalculate-running
     *   php artisan grades:recalculate-running --subject=<uuid>
     *   php artisan grades:recalculate-running --institution=<uuid>
     *   php artisan grades:recalculate-running --dry-run
     */
    protected $signature = 'grades:recalculate-running
        {--subject= : Limit to one subject}
        {--institution= : Limit to one institution}
        {--dry-run : Report how much would be recalculated without writing}';

    protected $description = 'Rebuild running grades from the scores already entered, for grade items whose academic year has since been corrected.';

    public function handle(RunningGradeRecalcService $recalc): int
    {
        $dryRun = (bool) $this->option('dry-run');

        // A running grade covers a whole grading period, so one item per
        // student/subject/period/year is enough to rebuild it.
        $query = DB::table('student_ecr_item_scores as scores')
            ->join('subject_ecr_items as items', 'items.id', '=', 'scores.subject_ecr_item_id')
            ->join('subjects_ecr as categories', 'categories.id', '=', 'items.subject_ecr_id')
            ->join('subjects', 'subjects.id', '=', 'categories.subject_id')
            ->select('scores.student_id', DB::raw('MIN(items.id) as item_id'))
            ->groupBy('scores.student_id', 'categories.subject_id', 'items.quarter', 'items.academic_year');

        if ($subjectId = $this->option('subject')) {
            $query->where('categories.subject_id', $subjectId);
        }

        if ($institutionId = $this->option('institution')) {
            $query->where('subjects.institution_id', $institutionId);
        }

        $groups = $query->get();

        if ($dryRun) {
            $this->info("Would recalculate {$groups->count()} running grades.");

            return self::SUCCESS;
        }

        $bar = $this->output->createProgressBar($groups->count());
        $bar->start();

        $failed = 0;
        foreach ($groups as $group) {
            try {
                $recalc->recalculate($group->student_id, $group->item_id);
            } catch (\Throwable $e) {
                $failed++;
                $this->newLine();
                $this->warn("Skipped student {$group->student_id} on item {$group->item_id}: {$e->getMessage()}");
            }
            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info('Recalculated ' . ($groups->count() - $failed) . " running grades, {$failed} skipped.");

        return self::SUCCESS;
    }
}
