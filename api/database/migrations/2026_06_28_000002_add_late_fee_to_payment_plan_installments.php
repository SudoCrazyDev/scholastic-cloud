<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_plan_installments', function (Blueprint $table) {
            // Late fee charged once an installment passes its grace window, as a
            // percentage of that installment's net amount. 0 => no late fee.
            $table->decimal('late_fee_percentage', 5, 2)->default(0)->after('grace_period_days');
        });
    }

    public function down(): void
    {
        Schema::table('payment_plan_installments', function (Blueprint $table) {
            $table->dropColumn('late_fee_percentage');
        });
    }
};
