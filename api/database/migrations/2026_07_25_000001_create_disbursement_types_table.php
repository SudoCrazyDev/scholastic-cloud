<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Dynamic categories for disbursements/expenses (e.g. Utilities, Supplies,
     * Salaries). Managed per-institution by finance/admin staff, who can add
     * and remove types freely.
     */
    public function up(): void
    {
        Schema::create('disbursement_types', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->string('name');
            $table->timestamps();

            $table->unique(['institution_id', 'name']);
            $table->index('institution_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('disbursement_types');
    }
};
