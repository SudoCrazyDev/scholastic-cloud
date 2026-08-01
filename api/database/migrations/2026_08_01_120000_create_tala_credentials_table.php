<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Where a Tala conversation's API key comes from.
     *
     * Two kinds of row live here, told apart by `user_id`:
     *
     *   - `user_id` null — the institution's key, set by an administrator and
     *     used by every teacher at that school.
     *   - `user_id` set — a teacher's own key, used only when their school has
     *     not supplied one (or has switched sharing off).
     *
     * The institution's key wins. A school that pays for the platform decides
     * which model its staff talk to and carries the bill; a personal key is the
     * fallback for schools that have not set one up yet.
     */
    public function up(): void
    {
        Schema::create('tala_credentials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('user_id')->nullable();

            /*
             * MySQL treats NULLs as distinct in a unique index, so
             * (institution_id, user_id, provider) would happily accept a
             * second institution-wide Anthropic key. `owner_key` is the same
             * value with the null collapsed to a sentinel — the model keeps it
             * in step on save — so one row per owner per provider is a
             * constraint rather than a convention.
             */
            $table->string('owner_key', 64);

            $table->string('provider', 32);
            $table->string('model')->nullable();

            // Ciphertext, via the model's `encrypted` cast. Never selected into
            // an API response; the UI works off `key_last_four`.
            $table->text('api_key');
            $table->string('key_last_four', 8)->nullable();

            /*
             * Institution rows only. Lets an administrator park a key without
             * opening it to staff — during setup, or to switch the whole school
             * back to personal keys without deleting and re-entering it.
             */
            $table->boolean('shared_with_staff')->default(true);

            // Institution rows only. Null means uncapped.
            $table->unsignedInteger('monthly_message_limit')->nullable();

            $table->boolean('is_active')->default(true);
            $table->uuid('created_by')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->unique(['institution_id', 'owner_key', 'provider']);
            $table->index(['institution_id', 'user_id']);

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tala_credentials');
    }
};
