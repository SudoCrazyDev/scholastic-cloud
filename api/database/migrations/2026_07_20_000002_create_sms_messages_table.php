<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('gateway_id')->nullable();     // null until an outbound message is claimed
            $table->enum('direction', ['outbound', 'inbound']);
            $table->string('to_number')->nullable();
            $table->string('from_number')->nullable();
            $table->text('body');
            $table->enum('status', [
                'queued', 'sending', 'sent', 'delivered', 'failed', 'received', 'canceled',
            ]);
            $table->unsignedSmallInteger('segments')->default(1);
            $table->text('error')->nullable();
            $table->string('provider_ref')->nullable();  // modem message reference, for delivery-report matching
            $table->string('source')->nullable();        // manual | announcement | finance | attendance
            $table->string('source_type')->nullable();   // originating model class, optional
            $table->string('source_id')->nullable();      // originating record id, optional
            $table->uuid('queued_by')->nullable();
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('gateway_id')->references('id')->on('sms_gateways')->nullOnDelete();
            $table->foreign('queued_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['gateway_id', 'status']);
            $table->index(['institution_id', 'direction', 'created_at']);
            $table->index('provider_ref');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_messages');
    }
};
