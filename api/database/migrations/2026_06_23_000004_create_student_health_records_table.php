<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Health / medical information captured on the admission form. One row per student.
     * Each item is a yes/no answer plus a free-text note (the form's "when"/"details").
     */
    public function up(): void
    {
        Schema::create('student_health_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('student_id')->unique()->constrained('students')->onDelete('cascade');

            $table->boolean('had_chicken_pox')->default(false);
            $table->string('had_chicken_pox_note')->nullable();

            $table->boolean('had_chicken_pox_vaccine')->default(false);
            $table->string('had_chicken_pox_vaccine_note')->nullable();

            $table->boolean('hospitalization_past_year')->default(false);
            $table->text('hospitalization_past_year_note')->nullable();

            $table->boolean('chronic_condition')->default(false);
            $table->text('chronic_condition_note')->nullable();

            $table->boolean('allergies')->default(false);
            $table->text('allergies_note')->nullable();

            $table->boolean('other_medical_problems')->default(false);
            $table->text('other_medical_problems_note')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_health_records');
    }
};
