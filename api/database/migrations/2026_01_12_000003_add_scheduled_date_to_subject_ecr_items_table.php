<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('subject_ecr_items', function (Blueprint $table) {
            // Date when this item is scheduled/given (used by lesson plan calendar)
            $table->date('scheduled_date')->nullable()->after('academic_year');
            // Use Laravel's default index naming to avoid collisions across environments.
            $table->index(['subject_ecr_id', 'scheduled_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->dropIndex(['subject_ecr_id', 'scheduled_date']);
            $table->dropColumn('scheduled_date');
        });
    }
};

