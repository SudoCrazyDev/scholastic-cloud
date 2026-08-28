<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gate kiosk devices — the paired identity behind an offline-capable gate.
 *
 * Until now a kiosk was identified by an `institution_id` in its query string
 * (`/gate-enter?institution_id=…`), which is enough to *write* one scan but not
 * to *download* a roster and its photos. A device row gives each kiosk the same
 * kind of identity `sms_gateways` gives an SMS kiosk: an admin registers it, a
 * one-time pairing code is exchanged for a long-lived token, and the token —
 * not the URL — is what says which institution and which gate it belongs to.
 *
 * The sync/outbox columns are created here even though nothing reports them
 * until later phases, so a device that starts heartbeating has somewhere to put
 * what it knows rather than waiting on a second migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gate_devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('name');
            $table->string('location')->nullable();
            // `both` is for a single reader used as an in/out toggle; the kiosk
            // page still picks one direction per session.
            $table->enum('gate_type', ['enter', 'exit', 'both'])->default('enter');
            $table->string('device_token_hash')->nullable()->unique();
            $table->string('pairing_code', 8)->nullable();
            $table->timestamp('pairing_code_expires_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();

            // What the device believes about its own local copy. Reported, not
            // authoritative — the portal shows it so a stuck kiosk is visible.
            $table->timestamp('last_sync_at')->nullable();
            $table->unsignedInteger('roster_count')->nullable();
            $table->unsignedInteger('pending_count')->nullable();
            // Device clock minus server clock, in ms. A Pi has no RTC, so a
            // device that boots without a network stamps scans from a wrong
            // clock; this is how that becomes visible instead of silent.
            $table->integer('clock_offset_ms')->nullable();
            $table->string('app_version')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->index('institution_id');
            $table->index(['institution_id', 'gate_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gate_devices');
    }
};
