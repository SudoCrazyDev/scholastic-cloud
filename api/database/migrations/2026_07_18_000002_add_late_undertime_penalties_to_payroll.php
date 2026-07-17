<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Institution-wide penalty policy (₱ per minute). Setting both to 0
        // disables the penalty model and falls back to hours-based pay.
        Schema::table('institutions', function (Blueprint $table) {
            $table->decimal('late_penalty_per_minute', 8, 2)->default(2);
            $table->decimal('undertime_penalty_per_minute', 8, 2)->default(2);
        });

        // Snapshot of the rates at generation time, plus period totals.
        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('late_penalty_per_minute', 8, 2)->default(0)->after('hours_per_day');
            $table->decimal('undertime_penalty_per_minute', 8, 2)->default(0)->after('late_penalty_per_minute');
            $table->unsignedInteger('late_minutes')->default(0)->after('hours_worked');
            $table->unsignedInteger('undertime_minutes')->default(0)->after('late_minutes');
            $table->decimal('penalty_total', 12, 2)->default(0)->after('undertime_minutes');
        });

        // Per-day schedule snapshot (needed to recompute after manual time
        // edits) and the priced late/undertime result.
        Schema::table('payslip_days', function (Blueprint $table) {
            $table->time('schedule_start')->nullable()->after('lunch_end');
            $table->time('schedule_end')->nullable()->after('schedule_start');
            $table->unsignedSmallInteger('grace_minutes')->default(0)->after('schedule_end');
            $table->unsignedSmallInteger('late_minutes')->default(0)->after('hours_worked');
            $table->unsignedSmallInteger('undertime_minutes')->default(0)->after('late_minutes');
            $table->decimal('penalty_amount', 10, 2)->default(0)->after('undertime_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('payslip_days', function (Blueprint $table) {
            $table->dropColumn([
                'schedule_start', 'schedule_end', 'grace_minutes',
                'late_minutes', 'undertime_minutes', 'penalty_amount',
            ]);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn([
                'late_penalty_per_minute', 'undertime_penalty_per_minute',
                'late_minutes', 'undertime_minutes', 'penalty_total',
            ]);
        });

        Schema::table('institutions', function (Blueprint $table) {
            $table->dropColumn(['late_penalty_per_minute', 'undertime_penalty_per_minute']);
        });
    }
};
