<?php

use App\Services\Matatag\CatalogLoader;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Puts DepEd's Grade 1 catalog into the curriculum tables.
 *
 * A data migration rather than a seeder, because **deployment runs migrations
 * and nothing else**. A `db:seed` step exists in no workflow in this repo, so a
 * seeder here would never run in production or on any VIP client, and the
 * module would ship with an empty catalog everywhere.
 *
 * It is safe on every tenant: the catalog is global reference data, identical
 * in every school, and a school that has not been switched on for the
 * `matatag-grading` feature simply never reads it.
 *
 * Re-running is a no-op. The loader matches on natural keys — code, area key,
 * competency path — so `migrate:fresh` and a redeploy both land on the same
 * rows, and the artisan command can load a corrected file over the top without
 * this migration having to be rolled back first.
 */
return new class extends Migration
{
    private const CODE = 'deped-matatag-ks1-grade-1-v1';

    public function up(): void
    {
        $path = database_path('data/matatag/grade-1.v1.json');

        // Deliberately not silent. If the catalog file is missing the module
        // is useless, and a deploy that quietly skipped it would surface as a
        // Grade 1 adviser opening an empty grid weeks later.
        (new CatalogLoader)->loadFile($path, makeDefault: true, force: true);
    }

    /**
     * Rolling back removes the catalog, which is only ever safe before anyone
     * has used it.
     *
     * The database would refuse anyway — `matatag_competency_ratings.slot_id`
     * is `ON DELETE RESTRICT` — but a raw SQLSTATE 23000 in the middle of a
     * rollback is a poor way to learn that a school has a term of descriptors
     * recorded.
     */
    public function down(): void
    {
        $version = DB::table('matatag_curriculum_versions')->where('code', self::CODE)->first();

        if (! $version) {
            return;
        }

        $ratings = DB::table('matatag_competency_ratings')
            ->where('curriculum_version_id', $version->id)
            ->count();

        if ($ratings > 0) {
            throw new RuntimeException(
                "Refusing to roll back: {$ratings} descriptor(s) have been recorded against the ".
                'Grade 1 MATATAG catalog. Removing it would destroy them.'
            );
        }

        $pins = DB::table('matatag_section_curricula')
            ->where('curriculum_version_id', $version->id)
            ->count();

        if ($pins > 0) {
            throw new RuntimeException(
                "Refusing to roll back: {$pins} section(s) are reporting on the Grade 1 MATATAG ".
                'catalog this year. Opt them out first.'
            );
        }

        DB::table('matatag_grade_level_curricula')
            ->where('curriculum_version_id', $version->id)
            ->delete();

        // Areas, domains, competencies and slots all cascade from the version.
        DB::table('matatag_curriculum_versions')->where('id', $version->id)->delete();
    }
};
