<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How late a gate scan may be and still be worth texting a parent about.
 *
 * `GateSmsNotifier` fires on insert, and from the moment kiosks can upload a
 * backlog that insert may be hours after the tap. A parent receiving "your child
 * has entered school" at three in the afternoon is worse than receiving nothing:
 * it is wrong about the only thing it claims, and a school cannot un-send it.
 *
 * Default 15 minutes, which existing gates inherit — a deliberate change in
 * behaviour for them, and the safe direction to be wrong in. `0` disables the
 * suppression and always sends.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gate_sms_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('late_threshold_minutes')->default(15)->after('cooldown_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('gate_sms_settings', function (Blueprint $table) {
            $table->dropColumn('late_threshold_minutes');
        });
    }
};
