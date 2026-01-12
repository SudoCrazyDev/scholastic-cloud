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

        return ['utf8mb4', 'utf8mb4_unicode_ci'];
    }

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        [$subjectsCharset, $subjectsCollation] = $this->getColumnCharsetAndCollation('subjects', 'id');
        // subject_quarter_plans is created by our previous migration; read its id charset/collation too
        [$plansCharset, $plansCollation] = $this->getColumnCharsetAndCollation('subject_quarter_plans', 'id');
        [$topicsCharset, $topicsCollation] = $this->getColumnCharsetAndCollation('topics', 'id');

        Schema::create('lesson_plans', function (Blueprint $table) use ($subjectsCharset, $subjectsCollation, $plansCharset, $plansCollation, $topicsCharset, $topicsCollation) {
            $table->uuid('id')->primary();
            // Match existing referenced UUID columns' charset/collation to avoid FK errors.
            $table->char('subject_id', 36)->charset($subjectsCharset)->collation($subjectsCollation);
            $table->char('subject_quarter_plan_id', 36)->nullable()->charset($plansCharset)->collation($plansCollation);
            $table->char('topic_id', 36)->nullable()->charset($topicsCharset)->collation($topicsCollation);

            // Stored as string to match existing Topic.quarter usage.
            $table->string('quarter');
            $table->date('lesson_date');

            $table->string('title')->nullable();
            // JSON payload so we can evolve schema without migrations.
            $table->json('content')->nullable();

            // "ai" or "manual" (kept simple)
            $table->string('generated_by')->nullable();
            $table->uuid('generated_by_user_id')->nullable();

            $table->timestamps();

            $table->unique(['subject_id', 'quarter', 'lesson_date']);
            $table->index(['subject_id', 'quarter', 'lesson_date']);
        });

        Schema::table('lesson_plans', function (Blueprint $table) {
            $table->foreign('subject_id')->references('id')->on('subjects')->onDelete('cascade');
            $table->foreign('subject_quarter_plan_id')->references('id')->on('subject_quarter_plans')->nullOnDelete();
            $table->foreign('topic_id')->references('id')->on('topics')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('lesson_plans', function (Blueprint $table) {
            $table->dropForeign(['subject_id']);
            $table->dropForeign(['subject_quarter_plan_id']);
            $table->dropForeign(['topic_id']);
        });
        Schema::dropIfExists('lesson_plans');
    }
};

