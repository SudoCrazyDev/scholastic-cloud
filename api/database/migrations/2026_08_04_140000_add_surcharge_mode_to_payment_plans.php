<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * How a plan assesses the late-fee percentages its installments carry.
     *
     * `per_installment` is what every existing plan does: each installment is surcharged
     * once, on its own amount, when its grace window elapses unpaid. Some schools instead
     * roll the unpaid balance forward and surcharge it again each period, so an unpaid
     * July is charged again when August opens — and the earlier surcharge is part of what
     * gets surcharged. `carry_over` selects that.
     *
     * Defaulted to `per_installment` so no existing plan changes behaviour.
     */
    public function up(): void
    {
        Schema::table('payment_plans', function (Blueprint $table) {
            $table->string('surcharge_mode', 20)
                ->default('per_installment')
                ->after('advance_payment_mode');
        });
    }

    public function down(): void
    {
        Schema::table('payment_plans', function (Blueprint $table) {
            $table->dropColumn('surcharge_mode');
        });
    }
};
