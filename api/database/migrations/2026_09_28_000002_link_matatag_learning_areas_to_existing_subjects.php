<?php

use App\Models\ClassSection;
use App\Models\MatatagSectionCurriculum;
use App\Services\Matatag\LearningAreaTeachers;
use Illuminate\Database\Migrations\Migration;

/**
 * Link the learning areas of sections already on MATATAG to their subjects.
 *
 * New opt-ins do this themselves. Sections that opted in before learning-area
 * teachers existed get the same treatment once, here: each area is linked to
 * the one subject whose title names it, so its subject teacher can start
 * marking without waiting for the adviser. Ambiguous or unmatched areas are
 * left with the adviser, who can link them on the MATATAG Progress tab.
 *
 * Adds links only; never changes or removes one. Safe to re-run.
 */
return new class extends Migration
{
    public function up(): void
    {
        $teachers = app(LearningAreaTeachers::class);

        MatatagSectionCurriculum::where('enabled', true)
            ->get()
            ->each(function (MatatagSectionCurriculum $pin) use ($teachers) {
                $section = ClassSection::find($pin->class_section_id);

                if ($section) {
                    $teachers->autoLink($section, $pin, null);
                }
            });
    }

    public function down(): void
    {
        // The links are dropped with their table by the previous migration.
    }
};
