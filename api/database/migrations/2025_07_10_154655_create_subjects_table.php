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
        Schema::create('subjects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->constrained()->onDelete('cascade');
            $table->foreignUuid('class_section_id')->constrained()->onDelete('cascade');
            $table->foreignUuid('adviser')->nullable()->constrained('users')->onDelete('set null');
            $table->enum('subject_type', ['parent', 'child'])->default('parent');
            $table->uuid('parent_subject_id')->nullable();
            $table->string('title');
            $table->string('variant')->nullable();
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->boolean('is_limited_student')->default(false);
            $table->integer('order')->default(0);
            $table->timestamps();
        });

        // Add self-referencing foreign key after table creation
        Schema::table('subjects', function (Blueprint $table) {
            $table->foreign('parent_subject_id')->references('id')->on('subjects')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subjects', function (Blueprint $table) {
            $table->dropForeign(['parent_subject_id']);
        });
        Schema::dropIfExists('subjects');
    }
};
