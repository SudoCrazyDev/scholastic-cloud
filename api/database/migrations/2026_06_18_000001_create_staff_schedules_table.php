<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A schedule is a reusable template (name + description + weekly hours)
        // that can be assigned to many staff.
        Schema::create('staff_schedules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['institution_id', 'name'], 'staff_schedules_institution_name_unique');
            $table->index(['institution_id', 'is_active'], 'staff_schedules_institution_active_idx');
        });

        Schema::create('staff_schedule_days', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('staff_schedule_id');
            $table->string('day_of_week'); // monday|tuesday|...|sunday
            $table->time('start_time');
            $table->time('end_time');
            $table->time('lunch_start')->nullable();
            $table->time('lunch_end')->nullable();
            $table->timestamps();

            $table->foreign('staff_schedule_id')->references('id')->on('staff_schedules')->cascadeOnDelete();
            // One row per weekday in a template; absent day = day off.
            $table->unique(['staff_schedule_id', 'day_of_week'], 'staff_schedule_days_schedule_day_unique');
        });

        // Assigns a schedule template to a staff member. One schedule per staff.
        Schema::create('staff_schedule_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('staff_schedule_id');
            $table->uuid('user_id');
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('staff_schedule_id')->references('id')->on('staff_schedules')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['institution_id', 'user_id'], 'staff_schedule_assignments_institution_user_unique');
            $table->index('staff_schedule_id', 'staff_schedule_assignments_schedule_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_schedule_assignments');
        Schema::dropIfExists('staff_schedule_days');
        Schema::dropIfExists('staff_schedules');
    }
};
