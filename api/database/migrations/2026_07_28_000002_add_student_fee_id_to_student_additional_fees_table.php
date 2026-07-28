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
        Schema::table('student_additional_fees', function (Blueprint $table) {
            // Set when the charge came from a saved student fee, so the ledger row
            // can be traced back to the template it was picked from.
            $table->foreignUuid('student_fee_id')->nullable()->after('student_id')
                ->references('id')->on('student_fees')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropForeign(['student_fee_id']);
            $table->dropColumn('student_fee_id');
        });
    }
};
