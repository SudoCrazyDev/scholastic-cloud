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
        Schema::create('default_discounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->string('name');
            $table->string('discount_type')->default('fixed');
            $table->decimal('value', 12, 2);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignUuid('created_by')->nullable()->references('id')->on('users')->onDelete('set null');
            $table->timestamps();

            $table->unique(['institution_id', 'name']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('default_discounts');
    }
};
