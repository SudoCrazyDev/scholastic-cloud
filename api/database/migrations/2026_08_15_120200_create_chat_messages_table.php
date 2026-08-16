<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_messages', function (Blueprint $table) {
            // ULID, not the UUID the rest of the schema uses. Every read of this
            // table is "the newest N" or "everything after X", and a random
            // UUIDv4 sorts arbitrarily — there would be no way to page a
            // transcript without an extra sort column. A ULID sorts by the time
            // it was minted, so the primary key is also the reading order.
            $table->ulid('id')->primary();

            $table->uuid('conversation_id');
            // Carried on the row so moderation and retention can sweep by
            // institution without joining back through the conversation.
            $table->uuid('institution_id');

            $table->enum('sender_type', ['user', 'student', 'system']);
            $table->uuid('sender_id')->nullable();

            // Snapshot of the sender's name as it read when they posted. The
            // alternative is a polymorphic join to users-or-students on every
            // message in the transcript, and the same trick is already used by
            // announcements.author_role.
            $table->string('sender_name')->nullable();

            $table->text('body');
            $table->ulid('reply_to_id')->nullable();

            $table->timestamp('edited_at')->nullable();

            // A plain column, NOT Laravel's SoftDeletes. The model deliberately
            // does not use that trait: a removed message has to keep occupying
            // its place in the transcript as a tombstone, and the trait would
            // hide the row from every query instead. Deletes are never hard —
            // schools are asked for these transcripts.
            $table->timestamp('deleted_at')->nullable();
            $table->string('deleted_by_type')->nullable();
            $table->uuid('deleted_by_id')->nullable();

            $table->timestamps();

            $table->foreign('conversation_id')->references('id')->on('chat_conversations')->cascadeOnDelete();

            // Serves both reads: paging one transcript backwards, and the sync
            // poll asking for everything after a cursor across many groups.
            $table->index(['conversation_id', 'created_at'], 'chat_messages_conversation_time_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_messages');
    }
};
