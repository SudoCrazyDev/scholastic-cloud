<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per reader per announcement. reader_type distinguishes a
        // teacher/admin (user) from a student-portal viewer (student).
        Schema::create('announcement_reads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('announcement_id');
            $table->enum('reader_type', ['user', 'student']);
            $table->uuid('reader_id');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->foreign('announcement_id')->references('id')->on('announcements')->cascadeOnDelete();

            $table->unique(['announcement_id', 'reader_type', 'reader_id'], 'announcement_reads_unique');
            $table->index(['reader_type', 'reader_id'], 'announcement_reads_reader_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_reads');
    }
};
