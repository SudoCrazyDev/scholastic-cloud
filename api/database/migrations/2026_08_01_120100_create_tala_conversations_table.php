<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A teacher's chat threads with Tala.
     *
     * Conversations belong to the person, not the school. Nothing in the API
     * lets an administrator read someone else's thread — the institution-wide
     * view is usage counts only. Keeping that true is easier now than after a
     * "let me see what my teachers are asking" screen exists.
     */
    public function up(): void
    {
        Schema::create('tala_conversations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('user_id');

            // Taken from the opening message until the teacher renames it.
            $table->string('title')->nullable();

            // What answered, recorded per conversation rather than looked up at
            // read time: a school can change its key or model tomorrow, and an
            // old thread should still say who wrote it.
            $table->string('provider', 32)->nullable();
            $table->string('model')->nullable();

            $table->timestamp('last_message_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'last_message_at']);
            $table->index(['institution_id', 'created_at']);

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tala_conversations');
    }
};
