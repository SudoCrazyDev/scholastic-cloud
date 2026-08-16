<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Who is in a group, and where each person has read up to.
        //
        // Membership is derived from student_sections / student_subjects /
        // the adviser columns, but it is written down here rather than computed
        // per request for two reasons: the conversation list would otherwise
        // re-derive the whole school on every poll, and last_read_at needs
        // somewhere to live.
        Schema::create('chat_participants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('conversation_id');

            // Staff and students are separate identities in this system — a
            // teacher is a `users` row, a student signs in through `student_auth`
            // and never has one (see AuthenticateToken). So the participant is
            // polymorphic, and no foreign key can cover both.
            $table->enum('participant_type', ['user', 'student']);
            $table->uuid('participant_id');

            // What this person may do here, not who they are institution-wide.
            $table->enum('role', ['teacher', 'student']);

            $table->ulid('last_read_message_id')->nullable();
            $table->timestamp('last_read_at')->nullable();
            $table->timestamp('muted_at')->nullable();

            // Set when someone leaves the underlying section or subject —
            // transferred, promoted, or the subject reassigned. They keep read
            // access to what was said while they were there and lose the
            // composer. Rows are never deleted, so a transferred student does
            // not silently lose their own history.
            $table->timestamp('removed_at')->nullable();

            $table->timestamps();

            $table->foreign('conversation_id')->references('id')->on('chat_conversations')->cascadeOnDelete();

            $table->unique(
                ['conversation_id', 'participant_type', 'participant_id'],
                'chat_participants_unique'
            );

            // "Every group this person is in" — the first query of every poll.
            $table->index(['participant_type', 'participant_id'], 'chat_participants_person_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_participants');
    }
};
