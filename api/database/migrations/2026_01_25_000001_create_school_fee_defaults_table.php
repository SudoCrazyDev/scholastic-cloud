<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $tableName = 'school_fee_defaults';
        $uniqueName = 'sf_defaults_fee_grade_year_uq';
        $indexName = 'sf_defaults_inst_year_grade_idx';

        // If the migration previously failed after creating the table (e.g. index name too long),
        // the table may already exist but without the indexes. Handle that gracefully.
        if (!Schema::hasTable($tableName)) {
            Schema::create($tableName, function (Blueprint $table) use ($uniqueName, $indexName) {
                $table->uuid('id')->primary();
                $table->foreignUuid('school_fee_id')->references('id')->on('school_fees')->onDelete('cascade');
                $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
                $table->string('grade_level');
                $table->string('academic_year');
                $table->decimal('amount', 12, 2);
                $table->timestamps();

                // MariaDB has a 64-char identifier limit; Laravel's default generated names can be too long.
                $table->unique(['school_fee_id', 'grade_level', 'academic_year'], $uniqueName);
                $table->index(['institution_id', 'academic_year', 'grade_level'], $indexName);
            });

            return;
        }

        // Table exists: add missing indexes (idempotent).
        $existingIndexNames = collect(DB::select("SHOW INDEX FROM `$tableName`"))
            ->pluck('Key_name')
            ->unique()
            ->values()
            ->all();

        Schema::table($tableName, function (Blueprint $table) use ($existingIndexNames, $uniqueName, $indexName) {
            if (!in_array($uniqueName, $existingIndexNames, true)) {
                $table->unique(['school_fee_id', 'grade_level', 'academic_year'], $uniqueName);
            }
            if (!in_array($indexName, $existingIndexNames, true)) {
                $table->index(['institution_id', 'academic_year', 'grade_level'], $indexName);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('school_fee_defaults');
    }
};
