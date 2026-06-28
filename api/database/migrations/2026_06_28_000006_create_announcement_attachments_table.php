<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcement_attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('announcement_id');
            $table->string('file_path'); // object key on the r2 disk
            $table->string('file_name');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->timestamps();

            $table->foreign('announcement_id')->references('id')->on('announcements')->cascadeOnDelete();

            $table->index('announcement_id', 'announcement_attachments_announcement_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_attachments');
    }
};
