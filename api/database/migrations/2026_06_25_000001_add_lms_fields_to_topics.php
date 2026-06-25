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
        Schema::table('topics', function (Blueprint $table) {
            $table->json('content')->nullable()->after('description');
            $table->json('learning_objectives')->nullable()->after('content');
            $table->unsignedInteger('estimated_minutes')->nullable()->after('learning_objectives');
            $table->boolean('is_published')->default(false)->after('is_completed');

            $table->index(['subject_id', 'is_published']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('topics', function (Blueprint $table) {
            $table->dropIndex(['subject_id', 'is_published']);
            $table->dropColumn(['content', 'learning_objectives', 'estimated_minutes', 'is_published']);
        });
    }
};
