<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private function getColumnCharsetAndCollation(string $table, string $column): array
    {
        try {
            $row = DB::selectOne(
                "SELECT CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND COLUMN_NAME = ?
                 LIMIT 1",
                [$table, $column]
            );
            if ($row && !empty($row->charset) && !empty($row->collation)) {
                return [(string)$row->charset, (string)$row->collation];
            }
        } catch (\Throwable) {
            // ignore and fallback
        }

        // Conservative defaults commonly used by Laravel on MariaDB/MySQL
        return ['utf8mb4', 'utf8mb4_unicode_ci'];
    }

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        [$uuidCharset, $uuidCollation] = $this->getColumnCharsetAndCollation('subjects', 'id');

        Schema::create('subject_quarter_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // Match existing subjects.id charset/collation to avoid errno 150 on older databases.
            $table->char('subject_id', 36)->charset($uuidCharset)->collation($uuidCollation);

            // 1..4 (stored as string to match existing Topic.quarter usage)
            $table->string('quarter');

            // Defines the inclusive date range for generation.
            $table->date('start_date');
            $table->date('exam_date');

            // e.g. ["monday","wednesday","friday"]
            $table->json('meeting_days')->nullable();
            // e.g. ["2026-02-10","2026-02-17"]
            $table->json('excluded_dates')->nullable();

            // Requested counts for generated work (per quarter)
            $table->unsignedInteger('quizzes_count')->default(0);
            $table->unsignedInteger('assignments_count')->default(0);
            $table->unsignedInteger('activities_count')->default(0);
            $table->unsignedInteger('projects_count')->default(0);

            $table->uuid('created_by')->nullable();
            $table->uuid('updated_by')->nullable();

            $table->timestamps();

            $table->unique(['subject_id', 'quarter']);
            $table->index(['subject_id', 'quarter', 'exam_date']);
        });

        Schema::table('subject_quarter_plans', function (Blueprint $table) {
            $table->foreign('subject_id')->references('id')->on('subjects')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subject_quarter_plans', function (Blueprint $table) {
            $table->dropForeign(['subject_id']);
        });
        Schema::dropIfExists('subject_quarter_plans');
    }
};

