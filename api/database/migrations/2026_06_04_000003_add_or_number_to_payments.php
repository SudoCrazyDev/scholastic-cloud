<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Optional Official Receipt (OR) number, captured at the transaction level
     * and denormalized onto each line item (mirrors reference_number).
     */
    public function up(): void
    {
        Schema::table('payment_transactions', function (Blueprint $table) {
            $table->string('or_number')->nullable()->after('reference_number');
        });

        Schema::table('student_payments', function (Blueprint $table) {
            $table->string('or_number')->nullable()->after('reference_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payment_transactions', function (Blueprint $table) {
            $table->dropColumn('or_number');
        });

        Schema::table('student_payments', function (Blueprint $table) {
            $table->dropColumn('or_number');
        });
    }
};
