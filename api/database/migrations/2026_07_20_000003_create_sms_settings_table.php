<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id')->unique();
            $table->uuid('default_gateway_id')->nullable();
            $table->unsignedSmallInteger('rate_limit_per_minute')->default(20);
            $table->time('send_window_start')->nullable();
            $table->time('send_window_end')->nullable();
            $table->string('opt_out_keywords')->default('STOP');
            $table->string('sender_name')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('default_gateway_id')->references('id')->on('sms_gateways')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_settings');
    }
};
