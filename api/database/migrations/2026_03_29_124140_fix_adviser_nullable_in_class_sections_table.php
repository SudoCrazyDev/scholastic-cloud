<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // The adviser FK was NOT NULL but should be nullable (adviser is optional)
        Schema::table('class_sections', function (Blueprint $table) {
            $table->uuid('adviser')->nullable()->default(null)->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('class_sections', function (Blueprint $table) {
            $table->uuid('adviser')->nullable(false)->change();
        });
    }
};
