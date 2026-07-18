<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Per-staff overtime rate. Null = inherit the institution default
        // (institutions.overtime_rate_per_minute); a value overrides it,
        // and an explicit 0 disables overtime for this staff member.
        Schema::table('payroll_compensations', function (Blueprint $table) {
            $table->decimal('overtime_rate_per_minute', 8, 2)->nullable()->after('hours_per_day');
        });
    }

    public function down(): void
    {
        Schema::table('payroll_compensations', function (Blueprint $table) {
            $table->dropColumn('overtime_rate_per_minute');
        });
    }
};
