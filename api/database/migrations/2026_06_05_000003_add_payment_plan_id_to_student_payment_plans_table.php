<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_payment_plans', function (Blueprint $table) {
            $table->foreignUuid('payment_plan_id')
                ->nullable()
                ->after('academic_year')
                ->references('id')
                ->on('payment_plans')
                ->nullOnDelete();
        });

        Schema::table('student_payment_plans', function (Blueprint $table) {
            // payment_plan_id is now authoritative. The legacy enum is relaxed to a
            // nullable string so dynamic plans (e.g. "3 Terms") need no enum value.
            $table->string('plan_type')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('student_payment_plans', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payment_plan_id');
        });

        // plan_type is left as a nullable string on rollback (enum restoration is
        // omitted for cross-database portability).
    }
};
