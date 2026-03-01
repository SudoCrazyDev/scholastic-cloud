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
        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->string('status')->default('published')->after('type');
            $table->json('settings')->nullable()->after('content');
            $table->dateTime('open_at')->nullable()->after('scheduled_date');
            $table->dateTime('close_at')->nullable()->after('open_at');
            $table->dateTime('due_at')->nullable()->after('close_at');
            $table->boolean('allow_late_submission')->default(false)->after('due_at');

            $table->index(['type', 'status']);
            $table->index('open_at');
            $table->index('close_at');
            $table->index('due_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->dropIndex(['type', 'status']);
            $table->dropIndex(['open_at']);
            $table->dropIndex(['close_at']);
            $table->dropIndex(['due_at']);

            $table->dropColumn([
                'status',
                'settings',
                'open_at',
                'close_at',
                'due_at',
                'allow_late_submission',
            ]);
        });
    }
};
