<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Payroll is generated before the period is over — the July run happens on
     * the 29th so cash is ready by payday. The days that have not happened yet
     * carry no punches, and pricing them as recorded would pay ₱0 for days the
     * staff are going to work.
     *
     * Those punches are assumed from the staff member's own schedule instead,
     * and every assumed side is flagged so the payslip, the screen and anyone
     * auditing later can tell an assumption from a biometric reading.
     */
    public function up(): void
    {
        Schema::table('payslip_days', function (Blueprint $table) {
            $table->boolean('assumed_time_in')->default(false)->after('time_out');
            $table->boolean('assumed_time_out')->default(false)->after('assumed_time_in');
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->unsignedSmallInteger('assumed_days')->default(0)->after('days_worked');
        });
    }

    public function down(): void
    {
        Schema::table('payslip_days', function (Blueprint $table) {
            $table->dropColumn(['assumed_time_in', 'assumed_time_out']);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn('assumed_days');
        });
    }
};
