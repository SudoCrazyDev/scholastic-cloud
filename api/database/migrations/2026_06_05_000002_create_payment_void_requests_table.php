<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Void-request workflow for recorded payments.
     *
     * The finance role requests a void (status = pending) and must supply a
     * note. An institution-administrator / principal approves or disapproves.
     * When an admin initiates the void themselves the request is created
     * already approved (auto-approved). A void targets a whole receipt: either
     * a payment_transaction (multi-fee cashiering) or a single legacy
     * student_payment, both resolved via receipt_number when applied.
     */
    public function up(): void
    {
        Schema::create('payment_void_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreignUuid('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->string('academic_year');
            $table->string('receipt_number');
            $table->foreignUuid('payment_transaction_id')->nullable()
                ->references('id')->on('payment_transactions')->onDelete('set null');
            $table->foreignUuid('target_payment_id')->nullable()
                ->references('id')->on('student_payments')->onDelete('set null');
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('status')->default('pending'); // pending | approved | disapproved
            $table->text('request_note');
            $table->text('review_note')->nullable();
            $table->foreignUuid('requested_by')->nullable()->references('id')->on('users')->onDelete('set null');
            $table->foreignUuid('reviewed_by')->nullable()->references('id')->on('users')->onDelete('set null');
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index(['institution_id', 'status']);
            $table->index('receipt_number');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_void_requests');
    }
};
