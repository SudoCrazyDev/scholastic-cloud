<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Every ad-hoc student fee used to be amortized: it joined the principal the payment
     * plan divides across installments, so a one-off field trip quietly stretched over
     * ten months. Most of them are collected in cash on the spot, so a fee now declares
     * its basis — `cash` stands on its own outside the schedule, `installment` joins the
     * plan principal as before.
     *
     * It lives on the reusable template (which basis to suggest) and on the posted charge
     * (which basis was actually used), because a template can be re-pointed later and a
     * charge already on a ledger must not move with it.
     */
    public function up(): void
    {
        Schema::table('student_fees', function (Blueprint $table) {
            $table->string('billing_type', 20)->default('cash')->after('amount');
        });

        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->string('billing_type', 20)->default('cash')->after('amount');
        });

        // Charges already sitting on a ledger were split into installments under the old
        // rule. Backfilling them to `installment` keeps every schedule, balance and late
        // fee exactly where it is — only fees posted from here on default to cash.
        DB::table('student_additional_fees')->update(['billing_type' => 'installment']);
    }

    public function down(): void
    {
        Schema::table('student_fees', function (Blueprint $table) {
            $table->dropColumn('billing_type');
        });

        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropColumn('billing_type');
        });
    }
};
