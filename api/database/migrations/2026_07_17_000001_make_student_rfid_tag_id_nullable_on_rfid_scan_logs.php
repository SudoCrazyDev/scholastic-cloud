<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Allow scan logs that originate from a student ID QR code, which resolves
     * a student directly and may have no associated RFID tag.
     */
    public function up(): void
    {
        Schema::table('rfid_scan_logs', function (Blueprint $table) {
            $table->dropForeign(['student_rfid_tag_id']);
        });

        Schema::table('rfid_scan_logs', function (Blueprint $table) {
            $table->foreignUuid('student_rfid_tag_id')->nullable()->change();
        });

        Schema::table('rfid_scan_logs', function (Blueprint $table) {
            $table->foreign('student_rfid_tag_id')
                ->references('id')
                ->on('student_rfid_tags')
                ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Rows with a null tag cannot satisfy a NOT NULL constraint; remove them first.
        Schema::table('rfid_scan_logs', function (Blueprint $table) {
            $table->dropForeign(['student_rfid_tag_id']);
        });

        \Illuminate\Support\Facades\DB::table('rfid_scan_logs')
            ->whereNull('student_rfid_tag_id')
            ->delete();

        Schema::table('rfid_scan_logs', function (Blueprint $table) {
            $table->foreignUuid('student_rfid_tag_id')->nullable(false)->change();
        });

        Schema::table('rfid_scan_logs', function (Blueprint $table) {
            $table->foreign('student_rfid_tag_id')
                ->references('id')
                ->on('student_rfid_tags')
                ->onDelete('cascade');
        });
    }
};
