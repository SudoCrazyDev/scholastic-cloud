<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-institution color theme: one base hex per themeable slot
     * (primary, success, warning, danger, info). Null = use app defaults.
     */
    public function up(): void
    {
        Schema::table('institutions', function (Blueprint $table) {
            $table->json('theme')->nullable()->after('logo');
        });
    }

    public function down(): void
    {
        Schema::table('institutions', function (Blueprint $table) {
            $table->dropColumn('theme');
        });
    }
};
