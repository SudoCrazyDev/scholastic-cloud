<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A period either covers every employee (the old behaviour) or only the
        // ones on the staff schedules picked below — so teaching and non-teaching
        // staff can run on separate payroll runs.
        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->string('schedule_scope', 20)->default('all')->after('date_to');
        });

        // Targeting rows used when a period's scope is 'schedules'.
        Schema::create('payroll_period_staff_schedules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('payroll_period_id');
            $table->uuid('staff_schedule_id');
            $table->timestamps();

            $table->foreign('payroll_period_id')->references('id')->on('payroll_periods')->cascadeOnDelete();
            $table->foreign('staff_schedule_id')->references('id')->on('staff_schedules')->cascadeOnDelete();

            $table->unique(['payroll_period_id', 'staff_schedule_id'], 'payroll_period_schedules_unique');
            $table->index('staff_schedule_id', 'payroll_period_schedules_schedule_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_period_staff_schedules');

        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->dropColumn('schedule_scope');
        });
    }
};
