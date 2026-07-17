<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staff_schedule_days', function (Blueprint $table) {
            // Minutes after start_time before a punch-in counts as late.
            $table->unsignedSmallInteger('grace_minutes')->default(0)->after('start_time');
        });
    }

    public function down(): void
    {
        Schema::table('staff_schedule_days', function (Blueprint $table) {
            $table->dropColumn('grace_minutes');
        });
    }
};
