<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Removing an additional fee now soft-deletes it. For an auto-charged late fee this
     * is what makes a waiver stick: the row keeps its slot in the per-installment unique
     * index, so the next ledger load sees the installment as already handled instead of
     * charging it again.
     */
    public function up(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
