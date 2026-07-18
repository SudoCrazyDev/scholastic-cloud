<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Student-uploaded online payment receipts awaiting finance verification.
     *
     * A student uploads a proof-of-payment image for an installment on
     * My Finance (status = pending). Finance staff view the image, enter the
     * verified amount, then approve (posts a student_payments row, linked via
     * student_payment_id) or reject with a required review note. Installments
     * are computed live, so the target is identified by academic_year +
     * installment_sequence rather than a foreign key.
     */
    public function up(): void
    {
        Schema::create('payment_receipt_submissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreignUuid('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->string('academic_year');
            $table->unsignedInteger('installment_sequence');
            $table->string('installment_label')->nullable();
            $table->decimal('amount', 12, 2)->nullable(); // verified by staff on approval
            $table->string('file_path');
            $table->string('file_name');
            $table->string('mime_type')->nullable();
            $table->string('status')->default('pending'); // pending | approved | rejected
            $table->text('review_note')->nullable();
            $table->foreignUuid('reviewed_by')->nullable()->references('id')->on('users')->onDelete('set null');
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignUuid('student_payment_id')->nullable()
                ->references('id')->on('student_payments')->onDelete('set null');
            $table->timestamps();

            $table->index(['institution_id', 'status']);
            $table->index(['student_id', 'academic_year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_receipt_submissions');
    }
};
