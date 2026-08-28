<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a gate kiosk needs in order to upload a scan it took while offline.
 *
 * `client_scan_id` is the idempotency key, and it is the whole reason a kiosk can
 * retry safely: a device that uploads a batch and then loses the acknowledgement
 * — the exact failure a bad link produces — sends the same rows again, and the
 * server has to recognise them rather than record the same student twice.
 *
 * Unique per **institution**, not globally. A tenant-scoped key cannot be
 * squatted from another school, and the check the ingest endpoint does is then
 * the same shape as the index that enforces it. Both online scans and
 * admin-created rows leave it null, which a composite unique index permits any
 * number of in MySQL.
 *
 * `clock_suspect` marks a row whose `scanned_at` came from a device that had
 * never heard a real clock. A Raspberry Pi has no RTC, so a kiosk booted on a
 * dead link genuinely does not know the date, and these rows feed attendance —
 * where a wrong wall-clock *day* cannot be reconstructed afterwards. Better for
 * such a row to arrive visibly doubtful than quietly wrong.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rfid_scan_logs', function (Blueprint $table) {
            $table->string('client_scan_id', 64)->nullable()->after('device_name');
            $table->boolean('clock_suspect')->default(false)->after('client_scan_id');

            $table->unique(['institution_id', 'client_scan_id'], 'rfid_scan_logs_client_scan_unique');
        });
    }

    public function down(): void
    {
        Schema::table('rfid_scan_logs', function (Blueprint $table) {
            $table->dropUnique('rfid_scan_logs_client_scan_unique');
            $table->dropColumn(['client_scan_id', 'clock_suspect']);
        });
    }
};
