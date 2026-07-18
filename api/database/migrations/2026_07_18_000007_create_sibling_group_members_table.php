<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sibling_group_members', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('sibling_group_id')->references('id')->on('sibling_groups')->onDelete('cascade');
            $table->foreignUuid('student_id')->references('id')->on('students')->onDelete('cascade');
            // Intended per-sibling discount; materialized as a student_discounts
            // row only when finance applies it for an academic year.
            $table->string('discount_type')->nullable();
            $table->decimal('discount_value', 12, 2)->nullable();
            $table->foreignUuid('added_by')->nullable()->references('id')->on('users')->onDelete('set null');
            $table->timestamps();

            // A student can belong to at most one sibling group.
            $table->unique('student_id');
            $table->index('sibling_group_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sibling_group_members');
    }
};
