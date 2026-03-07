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
        Schema::create('student_online_payment_transactions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreignUuid('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->foreignUuid('school_fee_id')->nullable()->references('id')->on('school_fees')->onDelete('set null');
            $table->foreignUuid('completed_payment_id')->nullable()->references('id')->on('student_payments')->onDelete('set null');
            $table->foreignUuid('created_by')->nullable()->references('id')->on('users')->onDelete('set null');
            $table->string('provider')->default('maya_checkout');
            $table->string('status')->default('pending');
            $table->string('academic_year');
            $table->decimal('amount', 12, 2);
            $table->string('currency', 3)->default('PHP');
            $table->string('request_reference_number', 100)->unique('sop_txn_request_ref_unique');
            $table->string('provider_payment_id')->nullable();
            $table->string('provider_charge_id')->nullable();
            $table->text('checkout_url')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->text('failure_reason')->nullable();
            $table->json('provider_payload')->nullable();
            $table->json('provider_response')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['student_id', 'academic_year'], 'online_tx_student_year_idx');
            $table->index(['institution_id', 'status'], 'online_tx_inst_status_idx');
            $table->index('provider_payment_id', 'online_tx_provider_payment_idx');
            $table->index('provider_charge_id', 'online_tx_provider_charge_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_online_payment_transactions');
    }
};
