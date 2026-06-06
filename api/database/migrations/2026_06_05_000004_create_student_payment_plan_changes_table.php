<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_payment_plan_changes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('student_id');
            $table->string('academic_year');
            $table->uuid('payment_plan_id')->nullable();
            $table->uuid('previous_payment_plan_id')->nullable();
            $table->timestamp('changed_at');
            $table->uuid('changed_by')->nullable();
            $table->boolean('changed_by_student')->default(false);
            $table->string('note')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('student_id')->references('id')->on('students')->cascadeOnDelete();
            $table->foreign('payment_plan_id')->references('id')->on('payment_plans')->nullOnDelete();
            $table->foreign('previous_payment_plan_id')->references('id')->on('payment_plans')->nullOnDelete();
            $table->foreign('changed_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['institution_id', 'student_id', 'academic_year'], 'sppc_student_year_idx');
            $table->index('changed_at', 'sppc_changed_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_payment_plan_changes');
    }
};
