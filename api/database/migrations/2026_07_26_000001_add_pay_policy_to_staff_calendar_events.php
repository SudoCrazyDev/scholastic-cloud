<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Institution-wide pay policy for a calendar day.
     *
     * Adds the `suspension` entry type (class/work suspension declared by a
     * LGU or the school) plus two knobs payroll reads:
     *
     * - `pay_treatment` — `normal` keeps today's behaviour (holidays and
     *   suspensions pay only what the hours say). `full_day_paid` guarantees
     *   the daily rate for every staff member that day even with no punches;
     *   `no_pay` forces the day to zero.
     * - `dismissal_time` — a shortened day. Payroll snapshots this as the
     *   day's effective schedule end, so a staff member who came on time and
     *   stayed until dismissal earns the full daily rate through the normal
     *   penalty model, while someone who left even earlier is still docked.
     *
     * Defaults keep existing rows behaving exactly as before.
     */
    public function up(): void
    {
        Schema::table('staff_calendar_events', function (Blueprint $table) {
            $table->string('pay_treatment')->default('normal')->after('type'); // normal|full_day_paid|no_pay
            $table->time('dismissal_time')->nullable()->after('pay_treatment');
        });
    }

    public function down(): void
    {
        Schema::table('staff_calendar_events', function (Blueprint $table) {
            $table->dropColumn(['pay_treatment', 'dismissal_time']);
        });
    }
};
