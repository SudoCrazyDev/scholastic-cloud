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
        Schema::create('school_days', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->string('academic_year');
            $table->integer('month'); // 1-12
            $table->integer('year'); // e.g., 2025
            $table->integer('total_days')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('school_days');
    }
};

