<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Turns within a conversation.
     *
     * Token counts and `credential_source` sit on the row because they are what
     * the spend guard and the institution's usage screen are built from: a
     * teacher on their own key is not spending the school's budget, and only
     * rows marked `institution` count against its cap.
     */
    public function up(): void
    {
        Schema::create('tala_messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('conversation_id');

            // Denormalised so the usage query never has to join back through
            // conversations to count a month.
            $table->uuid('institution_id');
            $table->uuid('user_id');

            $table->string('role', 16); // user | assistant
            $table->longText('content');

            $table->string('provider', 32)->nullable();
            $table->string('model')->nullable();
            $table->string('credential_source', 16)->nullable(); // institution | user
            $table->unsignedInteger('tokens_in')->nullable();
            $table->unsignedInteger('tokens_out')->nullable();

            /*
             * A failed turn is kept rather than rolled back. A blank chat pane
             * after a provider outage tells the teacher nothing; the failed
             * exchange, still on screen, tells them to try again or check the
             * key.
             */
            $table->string('stop_reason', 32)->nullable();
            $table->text('error_message')->nullable();

            $table->timestamps();

            $table->index(['conversation_id', 'created_at']);
            $table->index(['institution_id', 'credential_source', 'created_at']);
            $table->index(['user_id', 'created_at']);

            $table->foreign('conversation_id')->references('id')->on('tala_conversations')->cascadeOnDelete();
            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tala_messages');
    }
};
