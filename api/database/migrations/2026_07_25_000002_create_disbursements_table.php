<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Disbursements / expenses recorded by finance staff. Each has a title,
     * optional description, amount, a dynamic type (disbursement_types), the
     * date it was issued, an optional in-charge user, and an optional receipt
     * image/PDF stored on R2 (receipt_path/name/mime).
     */
    public function up(): void
    {
        Schema::create('disbursements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreignUuid('disbursement_type_id')->nullable()
                ->references('id')->on('disbursement_types')->onDelete('set null');
            $table->string('title');
            $table->text('description')->nullable();
            $table->decimal('amount', 12, 2)->default(0);
            $table->date('date_issued');
            $table->foreignUuid('in_charge_user_id')->nullable()
                ->references('id')->on('users')->onDelete('set null');
            $table->string('receipt_path')->nullable();
            $table->string('receipt_name')->nullable();
            $table->string('receipt_mime')->nullable();
            $table->timestamps();

            $table->index(['institution_id', 'date_issued']);
            $table->index('disbursement_type_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('disbursements');
    }
};
