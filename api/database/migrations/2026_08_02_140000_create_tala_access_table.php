<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Who at a school may chat with Tala.
     *
     * Until now this followed the role: any role carrying `tala.manage` gave
     * Tala to every teacher holding it, all or nothing. Schools want it per
     * teacher — a pilot with two teachers, a department at a time — so access
     * moved here, and a row in this table is now the only thing that grants it.
     * `HasModulePermissions` reads it; roles no longer confer `tala.view` or
     * `tala.manage` at all.
     *
     * Revoking keeps the row and clears `is_active`, so "who took this away, and
     * when" survives. The alternative — deleting — makes an access question
     * unanswerable a term later.
     */
    public function up(): void
    {
        Schema::create('tala_access', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('user_id');

            $table->boolean('is_active')->default(true);

            $table->uuid('granted_by')->nullable();
            $table->timestamp('granted_at')->nullable();
            $table->uuid('revoked_by')->nullable();
            $table->timestamp('revoked_at')->nullable();

            $table->timestamps();

            // One row per teacher per school; granting again reactivates the
            // existing row rather than stacking history rows the resolver would
            // have to choose between.
            $table->unique(['institution_id', 'user_id']);

            // The permission check runs on nearly every request from a teacher
            // who has Tala, so it gets its own index rather than riding on the
            // unique one's column order.
            $table->index(['user_id', 'is_active']);
        });

        /*
         * Teachers' own API keys are gone as a concept: administrators set the
         * key the school chats through, and there is no longer any screen on
         * which a teacher could view, replace or delete a personal one.
         *
         * These rows are therefore unreachable — and they hold encrypted
         * third-party credentials that nobody owns or can rotate. Deleting is
         * the point of the change rather than a side effect of it.
         */
        DB::table('tala_credentials')->whereNotNull('user_id')->delete();

        /*
         * Roles that were granting Tala keep saying so otherwise.
         *
         * Nothing reads these — permission resolution strips them, and the role
         * builder no longer draws the boxes that set them — so they are inert
         * either way. But an administrator reading a role, or anyone reading the
         * table, would see a school still handing out Tala by role, which is now
         * false. `tala.configure` stays: that one is still a role's to give.
         */
        DB::table('role_permissions')->whereIn('permission', ['tala.view', 'tala.manage'])->delete();
    }

    public function down(): void
    {
        // The deleted personal keys are not recoverable here; they were secrets,
        // not data, and re-entering one was always a 30-second job.
        Schema::dropIfExists('tala_access');
    }
};
