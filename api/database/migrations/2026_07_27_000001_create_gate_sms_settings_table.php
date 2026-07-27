<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gate_sms_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('gate_type');                    // enter | exit
            $table->boolean('is_enabled')->default(false);
            $table->uuid('sms_gateway_id')->nullable();     // which kiosk/SIM sends; null = institution default
            $table->text('message_template');
            $table->unsignedSmallInteger('cooldown_minutes')->default(0);
            $table->string('timezone')->default('Asia/Manila'); // renders {time} / {date} in local wall clock
            $table->timestamps();

            $table->unique(['institution_id', 'gate_type']);
            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('sms_gateway_id')->references('id')->on('sms_gateways')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gate_sms_settings');
    }
};
