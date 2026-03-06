<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('grade_level_discounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('school_fee_id')->nullable();
            $table->string('grade_level');
            $table->string('academic_year');
            $table->string('discount_type')->default('fixed');
            $table->decimal('value', 12, 2);
            $table->string('description')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('school_fee_id')->references('id')->on('school_fees')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['institution_id', 'academic_year', 'grade_level'], 'gld_inst_year_grade_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('grade_level_discounts');
    }
};
