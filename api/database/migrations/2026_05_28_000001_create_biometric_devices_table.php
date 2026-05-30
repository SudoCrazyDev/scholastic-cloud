<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biometric_devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('name');
            $table->string('serial_number')->nullable();
            $table->string('mac_address')->nullable();
            $table->text('comm_key')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->enum('status', ['online', 'offline', 'unknown'])->default('unknown');
            $table->string('bridge_token_hash')->nullable()->unique();
            $table->string('pairing_code', 8)->nullable();
            $table->timestamp('pairing_code_expires_at')->nullable();
            $table->string('firmware_version')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->index('institution_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_devices');
    }
};
