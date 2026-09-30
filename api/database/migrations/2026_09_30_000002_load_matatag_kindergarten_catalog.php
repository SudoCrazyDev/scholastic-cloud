<?php

use App\Services\Matatag\CatalogLoader;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Puts DepEd's Kindergarten catalog into the curriculum tables, and makes it
 * the default for Kindergarten — which is what "Kinder 1" and "Kinder 2"
 * sections both resolve to.
 *
 * A data migration for the same reason Grade 1's is one: deployment runs
 * migrations and nothing else. Re-running is a no-op; see
 * 2026_09_14_000006_load_matatag_ks1_grade_1_catalog.php.
 */
return new class extends Migration
{
    private const CODE = 'deped-kindergarten-v1';

    public function up(): void
    {
        (new CatalogLoader)->loadFile(
            database_path('data/matatag/kindergarten.v1.json'),
            makeDefault: true,
            force: true,
        );
    }

    /**
     * Only ever safe before anyone has used it; refused otherwise, by name,
     * rather than by a raw foreign-key failure mid-rollback.
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
                "Refusing to roll back: {$ratings} rating(s) have been recorded against the ".
                'Kindergarten catalog. Removing it would destroy them.'
            );
        }

        $pins = DB::table('matatag_section_curricula')
            ->where('curriculum_version_id', $version->id)
            ->count();

        if ($pins > 0) {
            throw new RuntimeException(
                "Refusing to roll back: {$pins} section(s) are reporting on the Kindergarten ".
                'catalog. Opt them out first.'
            );
        }

        DB::table('matatag_grade_level_curricula')
            ->where('curriculum_version_id', $version->id)
            ->delete();

        DB::table('matatag_curriculum_versions')->where('id', $version->id)->delete();
    }
};
