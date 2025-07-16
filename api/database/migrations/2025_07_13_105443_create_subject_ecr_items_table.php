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
        Schema::create('subject_ecr_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('subject_ecr_id');
            $table->string('type')->nullable();
            $table->string('title');
            $table->text('description')->nullable();
            $table->decimal('score', 8, 2)->nullable();
            $table->timestamps();
            
            // Add index for performance
            $table->index('subject_ecr_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('subject_ecr_items');
    }
};