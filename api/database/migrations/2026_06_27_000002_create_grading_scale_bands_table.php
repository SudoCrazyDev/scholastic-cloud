<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('grading_scale_bands', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('grading_scale_id')->constrained('grading_scales')->onDelete('cascade');
            $table->string('label');
            $table->decimal('min_score', 5, 2);
            $table->decimal('max_score', 5, 2);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['grading_scale_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('grading_scale_bands');
    }
};
