<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * How a plan derives what each period is billed.
     *
     * `fixed` is what every existing plan does: the net charges are divided once, up front,
     * and the resulting figure stands for the life of the schedule — money collected simply
     * settles the earliest installments first.
     *
     * Some schools instead re-divide what is still owed every time a period opens, so the
     * monthly figure moves with the balance and the number of periods left to collect it in.
     * A student who pays extra in July is billed less from August; one who skips a month is
     * billed more, because the same balance now has fewer months to land in. `reamortizing`
     * selects that.
     *
     * Defaulted to `fixed` so no existing plan changes behaviour.
     */
    public function up(): void
    {
        Schema::table('payment_plans', function (Blueprint $table) {
            $table->string('schedule_mode', 20)
                ->default('fixed')
                ->after('advance_payment_mode');
        });
    }

    public function down(): void
    {
        Schema::table('payment_plans', function (Blueprint $table) {
            $table->dropColumn('schedule_mode');
        });
    }
};
