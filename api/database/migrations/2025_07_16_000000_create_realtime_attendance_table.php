<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('realtime_attendance', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->dateTime('auth_date_time');
            $table->date('auth_date');
            $table->time('auth_time');
            $table->string('direction');
            $table->string('device_name');
            $table->string('device_serial_no');
            $table->string('person_name');
            $table->string('card_no');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('realtime_attendance');
    }
}; 