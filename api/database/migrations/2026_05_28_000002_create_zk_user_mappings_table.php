<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('zk_user_mappings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('device_id');
            $table->string('zk_user_id');
            $table->string('zk_name')->nullable();
            $table->string('zk_card_no')->nullable();
            $table->string('zk_privilege')->nullable();
            $table->uuid('user_id')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('device_id')->references('id')->on('biometric_devices')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->unique(['device_id', 'zk_user_id'], 'zkum_device_zkuser_unique');
            $table->index(['institution_id', 'user_id'], 'zkum_inst_user_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('zk_user_mappings');
    }
};
