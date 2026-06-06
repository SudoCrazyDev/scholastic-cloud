<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_plan_installments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('payment_plan_id');
            $table->unsignedInteger('sequence');
            // Null label => service formats the resolved due date as "F Y" (month-year),
            // preserving the legacy monthly display. Custom plans supply e.g. "Term 1".
            $table->string('label')->nullable();
            $table->unsignedTinyInteger('due_month'); // 1-12 calendar month
            $table->unsignedTinyInteger('due_day');    // 1-31, clamped to the month length by the service
            // Null share => even split across all installments. When every installment in a
            // plan has a share, charges are allocated by percentage instead.
            $table->decimal('share_percentage', 5, 2)->nullable();
            $table->timestamps();

            $table->foreign('payment_plan_id')->references('id')->on('payment_plans')->cascadeOnDelete();
            $table->unique(['payment_plan_id', 'sequence'], 'ppi_plan_sequence_unique');
            $table->index('payment_plan_id', 'ppi_plan_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_plan_installments');
    }
};
