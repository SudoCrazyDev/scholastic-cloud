<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a subject sits on a Senior High report card.
 *
 * A Senior High card prints two tables — First Semester (quarters 1 and 2) and
 * Second Semester (quarters 3 and 4) — each split into Core and Applied and
 * Specialized subjects. Neither fact is on a subject today, so both columns are
 * nullable and optional: a subject left blank is placed by the quarters it has
 * grades in and printed without a group, which is what the card did before a
 * school filled these in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subjects', function (Blueprint $table) {
            $table->unsignedTinyInteger('semester')->nullable()->after('variant');
            $table->string('report_card_category', 20)->nullable()->after('semester');
        });
    }

    public function down(): void
    {
        Schema::table('subjects', function (Blueprint $table) {
            $table->dropColumn(['semester', 'report_card_category']);
        });
    }
};
