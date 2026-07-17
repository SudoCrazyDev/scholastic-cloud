<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Overtime pays a flat ₱/minute, but only for minutes a payroll
        // manager approved on the payslip day. 0 = overtime off.
        Schema::table('institutions', function (Blueprint $table) {
            $table->decimal('overtime_rate_per_minute', 8, 2)->default(0)->after('undertime_penalty_per_minute');
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('overtime_rate_per_minute', 8, 2)->default(0)->after('undertime_penalty_per_minute');
            $table->unsignedInteger('overtime_minutes')->default(0)->after('penalty_total');
            $table->decimal('overtime_total', 12, 2)->default(0)->after('overtime_minutes');
        });

        Schema::table('payslip_days', function (Blueprint $table) {
            // Detected = punched out past the scheduled end (informational);
            // only the approved overtime_minutes are paid.
            $table->unsignedSmallInteger('detected_overtime_minutes')->default(0)->after('penalty_amount');
            $table->unsignedSmallInteger('overtime_minutes')->default(0)->after('detected_overtime_minutes');
            $table->decimal('overtime_amount', 10, 2)->default(0)->after('overtime_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('payslip_days', function (Blueprint $table) {
            $table->dropColumn(['detected_overtime_minutes', 'overtime_minutes', 'overtime_amount']);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['overtime_rate_per_minute', 'overtime_minutes', 'overtime_total']);
        });

        Schema::table('institutions', function (Blueprint $table) {
            $table->dropColumn('overtime_rate_per_minute');
        });
    }
};
