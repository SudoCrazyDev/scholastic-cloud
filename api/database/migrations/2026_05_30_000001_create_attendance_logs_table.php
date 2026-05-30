<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('device_id');
            $table->string('zk_user_id');
            $table->uuid('user_id')->nullable();
            $table->timestamp('punched_at');
            $table->tinyInteger('punch_type_code')->default(0);
            $table->string('punch_type')->default('check_in');   // check_in|check_out|break_out|break_in|ot_in|ot_out
            $table->string('verify_type')->default('unknown');   // fingerprint|card|face|password|unknown
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('device_id')->references('id')->on('biometric_devices')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->unique(['device_id', 'zk_user_id', 'punched_at'], 'att_log_unique');
            $table->index(['institution_id', 'punched_at'], 'att_log_inst_time_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_logs');
    }
};
