<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Snapshot of the day exception that applied when the payslip was
     * generated (from a calendar suspension/holiday policy, an approved
     * staff attendance request, or both merged).
     *
     * Payslip days are re-priced purely from their own snapshots after a
     * manual time edit or a rate change, so the waivers have to live here —
     * not be re-read from the source tables — or an edit would silently
     * reinstate a penalty the admin already excused.
     *
     * A shortened day (LGU half-day) needs no column of its own: payroll
     * writes the dismissal time into the existing `schedule_end` snapshot.
     */
    public function up(): void
    {
        Schema::table('payslip_days', function (Blueprint $table) {
            $table->boolean('waive_late')->default(false)->after('grace_minutes');
            $table->boolean('waive_undertime')->default(false)->after('waive_late');
            // normal   — price by the usual rules
            // full_day — guarantee the daily rate regardless of hours worked
            // no_pay   — the day earns nothing
            $table->string('pay_policy')->default('normal')->after('waive_undertime');
            // Human-readable origin, printed on the DTR ("Suspension — half day").
            $table->string('exception_label')->nullable()->after('pay_policy');
        });
    }

    public function down(): void
    {
        Schema::table('payslip_days', function (Blueprint $table) {
            $table->dropColumn(['waive_late', 'waive_undertime', 'pay_policy', 'exception_label']);
        });
    }
};
