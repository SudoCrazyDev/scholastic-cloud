<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_calendar_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('type')->default('event'); // holiday|event
            $table->date('event_date');
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['institution_id', 'event_date'], 'staff_calendar_events_inst_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_calendar_events');
    }
};
