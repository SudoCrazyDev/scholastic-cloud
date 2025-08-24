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
        Schema::create('subject_template_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('template_id')->constrained('subject_templates')->onDelete('cascade');
            $table->enum('subject_type', ['parent', 'child'])->default('child');
            $table->uuid('parent_item_id')->nullable(); // Reference to parent item within same template
            $table->string('title');
            $table->string('variant')->nullable();
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->boolean('is_limited_student')->default(false);
            $table->integer('order')->default(0);
            $table->timestamps();
            
            // Add indexes
            $table->index('template_id');
            $table->index('parent_item_id');
        });
        
        // Add self-referencing foreign key after table creation
        Schema::table('subject_template_items', function (Blueprint $table) {
            $table->foreign('parent_item_id')->references('id')->on('subject_template_items')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subject_template_items', function (Blueprint $table) {
            $table->dropForeign(['parent_item_id']);
        });
        Schema::dropIfExists('subject_template_items');
    }
};