<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A group chat. Nobody creates one by hand: every row mirrors an
        // academic object that already decides who belongs together — a class
        // section (the advisory) or a subject. ChatMembershipSync owns the
        // lifecycle, so a section renamed or a teacher reassigned shows up here
        // without anyone maintaining a second list of people.
        Schema::create('chat_conversations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');

            $table->enum('type', ['advisory', 'subject']);

            // The academic row this group is derived from. Polymorphic across
            // class_sections and subjects, so no foreign key — the reconcile
            // pass in ChatMembershipSync is what clears conversations whose
            // scope row has gone.
            $table->enum('scope_type', ['class_section', 'subject']);
            $table->uuid('scope_id');

            // Not nullable, and that is deliberate: this column is half of the
            // uniqueness rule below, and MySQL treats NULLs in a unique index as
            // distinct from each other. A nullable column here would let the
            // same section collect a new group on every sync run.
            $table->string('academic_year')->default('');

            // Denormalized display text, refreshed on sync. The conversation
            // list is the most-polled screen in the feature; making it join two
            // levels deep to print "Grade 7 - Rizal" is not worth it.
            $table->string('title');
            $table->string('subtitle')->nullable();

            $table->timestamp('last_message_at')->nullable();

            // Reserved for teacher moderation (phase 4). The column lands now so
            // the read paths can honour it from the start and a later migration
            // does not have to touch a table that by then holds every message
            // thread in the school.
            $table->timestamp('locked_at')->nullable();

            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();

            $table->unique(['scope_type', 'scope_id', 'academic_year'], 'chat_conversations_scope_unique');
            $table->index(['institution_id', 'last_message_at'], 'chat_conversations_recent_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_conversations');
    }
};
