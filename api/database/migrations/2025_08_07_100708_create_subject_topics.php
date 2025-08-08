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
        Schema::create('topics', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('subject_id')->constrained('subjects')->onDelete('cascade');
            $table->string('quarter')->nullable();
            $table->string('title');
            $table->text('description')->nullable();
            $table->integer('order')->default(0);
            $table->boolean('is_completed')->default(false);
            $table->timestamps();

            $table->index(['subject_id', 'order']);
            $table->index(['subject_id', 'is_completed']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('topics');
    }
};
