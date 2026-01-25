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
        Schema::create('student_discounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreignUuid('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->foreignUuid('school_fee_id')->nullable()->references('id')->on('school_fees')->onDelete('set null');
            $table->string('academic_year');
            $table->string('discount_type');
            $table->decimal('value', 12, 2);
            $table->text('description')->nullable();
            $table->foreignUuid('created_by')->nullable()->references('id')->on('users')->onDelete('set null');
            $table->timestamps();

            $table->index(['student_id', 'academic_year']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_discounts');
    }
};
