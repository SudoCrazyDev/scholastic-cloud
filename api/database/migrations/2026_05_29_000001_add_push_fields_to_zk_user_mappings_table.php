<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('zk_user_mappings', function (Blueprint $table) {
            $table->enum('push_status', ['pending', 'done', 'failed'])->nullable()->after('last_synced_at');
            $table->enum('push_action', ['enroll_user', 'enroll_fingerprint'])->nullable()->after('push_status');
            $table->text('push_error')->nullable()->after('push_action');
            $table->timestamp('push_queued_at')->nullable()->after('push_error');
        });
    }

    public function down(): void
    {
        Schema::table('zk_user_mappings', function (Blueprint $table) {
            $table->dropColumn(['push_status', 'push_action', 'push_error', 'push_queued_at']);
        });
    }
};
