<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The sync poll now asks for messages that *changed* after a cursor, not ones
 * posted after it — otherwise a message removed an hour after it was sent never
 * reaches the people still looking at it, because their poll only ever asks
 * about newer created_at values.
 *
 * `updated_at` already carries that, and equals created_at until something
 * happens to the row. What was missing is the index: without one, the poll every
 * open tab makes every few seconds becomes a table scan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->index(['conversation_id', 'updated_at'], 'chat_messages_conversation_changed_idx');
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropIndex('chat_messages_conversation_changed_idx');
        });
    }
};
