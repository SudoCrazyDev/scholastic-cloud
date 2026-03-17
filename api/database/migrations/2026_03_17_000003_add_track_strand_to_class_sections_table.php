<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('class_sections', function (Blueprint $table) {
            $table->foreignUuid('track_id')->nullable()->after('department_id')->references('id')->on('tracks')->onDelete('set null');
            $table->foreignUuid('strand_id')->nullable()->after('track_id')->references('id')->on('strands')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('class_sections', function (Blueprint $table) {
            $table->dropForeign(['strand_id']);
            $table->dropForeign(['track_id']);
            $table->dropColumn(['strand_id', 'track_id']);
        });
    }
};
