<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            /*
             * Generation counter for the roster pushed to the chat service.
             *
             * Bumped every time this group's membership is re-derived. The
             * service ignores any push carrying a version at or below the one it
             * already holds, which is what makes the push safe to retry and safe
             * to receive out of order — the repair snapshot and a live change can
             * race, and without this the older of the two could win.
             */
            $table->unsignedBigInteger('roster_version')->default(0)->after('locked_at');

            // When the service last acknowledged a push for this group. Null
            // means it has never been told about this conversation at all.
            $table->timestamp('roster_pushed_at')->nullable()->after('roster_version');
        });
    }

    public function down(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->dropColumn(['roster_version', 'roster_pushed_at']);
        });
    }
};
