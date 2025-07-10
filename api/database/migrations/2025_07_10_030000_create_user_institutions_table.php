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
        Schema::create('user_institutions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreignId('role_id')->references('id')->on('roles')->onDelete('cascade');
            $table->boolean('is_default')->default(false);
            $table->boolean('is_main')->default(false);
            $table->timestamps();
            $table->unique(['user_id', 'institution_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_institutions');
    }
}; 