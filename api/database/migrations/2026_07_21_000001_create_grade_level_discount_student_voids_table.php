<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-student void of a grade-level discount. A grade-level discount is a
     * single record shared by every student in the grade, so it cannot be
     * soft-voided in place without affecting everyone. Instead, voiding one
     * from a student's ledger records an exclusion row here: the grade discount
     * is suppressed for that student only (dropped from ledger totals, running
     * balance, and NOA) while remaining active for the rest of the grade.
     */
    public function up(): void
    {
        Schema::create('grade_level_discount_student_voids', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->constrained()->onDelete('cascade');
            $table->foreignUuid('student_id')->constrained('students')->onDelete('cascade');
            // Explicit short FK name: the auto-generated
            // "grade_level_discount_student_voids_grade_level_discount_id_foreign" is 65 chars,
            // over MySQL's 64-char identifier limit, which made this migration fail.
            $table->foreignUuid('grade_level_discount_id');
            $table->foreign('grade_level_discount_id', 'gl_disc_student_void_gld_fk')
                ->references('id')->on('grade_level_discounts')->onDelete('cascade');
            $table->string('academic_year');
            $table->timestamp('voided_at')->nullable();
            $table->foreignUuid('voided_by')->nullable()
                ->references('id')->on('users')->onDelete('set null');
            $table->text('void_note')->nullable();
            $table->timestamps();

            $table->unique(['student_id', 'grade_level_discount_id'], 'grade_disc_student_void_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('grade_level_discount_student_voids');
    }
};
