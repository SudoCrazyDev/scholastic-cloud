<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Institution-designed payslip layouts (mirrors receipt_templates).
        Schema::create('payslip_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('name');
            $table->boolean('is_default')->default(false);
            $table->string('paper_size')->default('Half-Letter');
            $table->json('layout');
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->index('institution_id', 'payslip_templates_institution_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payslip_templates');
    }
};
