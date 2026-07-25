<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_gateways', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('name');
            $table->string('location')->nullable();
            $table->enum('platform', ['linux', 'windows', 'unknown'])->default('unknown');
            $table->enum('status', ['online', 'offline', 'unknown'])->default('unknown');
            $table->string('sms_token_hash')->nullable()->unique();
            $table->string('pairing_code', 8)->nullable();
            $table->timestamp('pairing_code_expires_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->integer('signal_strength')->nullable();     // CSQ 0–31
            $table->string('network_operator')->nullable();
            $table->string('sim_msisdn')->nullable();           // the SIM's own number, if known
            $table->string('sim_balance')->nullable();          // free-form, from USSD
            $table->string('imei')->nullable();
            $table->string('modem_model')->nullable();
            $table->string('agent_version')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->index('institution_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_gateways');
    }
};
