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
        Schema::create('school_fee_defaults', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('school_fee_id')->references('id')->on('school_fees')->onDelete('cascade');
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->string('grade_level');
            $table->string('academic_year');
            $table->decimal('amount', 12, 2);
            $table->timestamps();

            $table->unique(['school_fee_id', 'grade_level', 'academic_year']);
            $table->index(['institution_id', 'academic_year', 'grade_level']);
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
