<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_commands', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('device_id');
            $table->string('cmd_id')->unique();   // ID echoed back by device on completion
            $table->enum('command_type', ['add_user', 'update_user', 'delete_user']);
            $table->text('payload');               // the command string served to device (without C:id: prefix)
            $table->enum('status', ['pending', 'sent', 'done', 'failed'])->default('pending');
            $table->text('device_response')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('device_id')->references('id')->on('biometric_devices')->cascadeOnDelete();
            $table->index(['device_id', 'status'], 'dev_cmd_device_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_commands');
    }
};
