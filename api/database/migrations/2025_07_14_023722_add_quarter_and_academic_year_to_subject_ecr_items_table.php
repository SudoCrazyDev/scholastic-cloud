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
            $table->string('quarter')->nullable()->after('description');
            $table->string('academic_year')->nullable()->after('quarter');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->dropColumn(['quarter', 'academic_year']);
        });
    }
};
