<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Taps the gate could not turn into a scan.
 *
 * A card the server cannot resolve has nowhere to go: `rfid_scan_logs` needs a
 * student, and there isn't one. Until now such a tap left a line in
 * `laravel.log` and nothing else, which means the one person who could act on it
 * — the office holding the unregistered card — never heard about it.
 *
 * Almost always it is exactly that: a new enrolment, a replacement card, a tag
 * typed in wrong. So this is a **worklist**, not a log. One row per card per
 * school with a count and a last-seen time, because "this card tapped 6 times
 * this morning, most recently at 07:41" is what makes it actionable, and six
 * identical rows would not.
 *
 * Written only from the **authenticated** device endpoint. The legacy
 * `/api/kiosk/scan` is public — institution comes from a query string — so
 * recording from there would let anyone fill this table with invented UIDs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gate_unresolved_scans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('gate_device_id')->nullable();
            $table->string('rfid_uid', 255);
            $table->string('type');                       // enter | exit, of the latest attempt
            $table->string('device_name')->nullable();
            $table->unsignedInteger('attempts')->default(1);
            $table->dateTime('first_seen_at');
            $table->dateTime('last_seen_at');
            // Carried through so the office is not misled by a time the device
            // itself could not vouch for.
            $table->boolean('clock_suspect')->default(false);
            $table->timestamps();

            $table->unique(['institution_id', 'rfid_uid']);
            $table->index(['institution_id', 'last_seen_at']);

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('gate_device_id')->references('id')->on('gate_devices')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gate_unresolved_scans');
    }
};
