<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_plan_installments', function (Blueprint $table) {
            // Days after the resolved due date before an overdue charge applies. 0 => due immediately.
            $table->unsignedSmallInteger('grace_period_days')->default(0)->after('due_day');
        });
    }

    public function down(): void
    {
        Schema::table('payment_plan_installments', function (Blueprint $table) {
            $table->dropColumn('grace_period_days');
        });
    }
};
