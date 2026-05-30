<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_payment_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('student_id');
            $table->string('academic_year');
            $table->enum('plan_type', ['monthly', 'quarterly']);
            $table->timestamp('selected_at')->nullable();
            $table->uuid('selected_by')->nullable();
            $table->boolean('selected_by_student')->default(false);
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('student_id')->references('id')->on('students')->cascadeOnDelete();
            $table->foreign('selected_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['institution_id', 'student_id', 'academic_year'], 'spp_unique_year');
            $table->index(['student_id', 'academic_year'], 'spp_student_year_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_payment_plans');
    }
};
