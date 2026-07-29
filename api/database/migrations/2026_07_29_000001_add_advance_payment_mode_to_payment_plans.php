<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_plans', function (Blueprint $table) {
            // How money collected before the schedule's first month is treated.
            //   'equal_split'        => it settles installments earliest-first (the
            //                           historical behaviour, so every existing plan
            //                           keeps its current amounts).
            //   'net_of_downpayment' => it is a downpayment: deducted from the amount
            //                           the schedule is divided from, lowering every
            //                           installment instead of paying the first few off.
            $table->string('advance_payment_mode', 32)
                ->default('equal_split')
                ->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('payment_plans', function (Blueprint $table) {
            $table->dropColumn('advance_payment_mode');
        });
    }
};
