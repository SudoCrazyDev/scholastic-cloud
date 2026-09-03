<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A backfill that names the fees on collections posted as "General / Other".
     *
     * A general collection settles no fee in particular, so the receipt it posted names
     * none either — the till, a reprint and any fee-by-fee reconciliation all read
     * "General / Other". The per-fee *balances* were never wrong: the ledger shares that
     * money across the fees that still owe every time it is read. What the backfill does
     * is write that share down, so the receipt says what the ledger already says.
     *
     * Because it writes the figures the ledger is already reporting, the receipt total
     * never moves and no balance changes. That is the whole safety case, and it is why
     * this is recorded as a *run* rather than done quietly: a run can be shown before it
     * is committed, and undone after.
     *
     * The trade-off it makes is real and one-way until reverted. General money floats — it
     * re-spreads itself if a new charge appears later. Named money does not. Pinning it is
     * the point (a receipt that names nothing cannot be reconciled), but it is a choice
     * about the books, so who made it and when is kept.
     */
    public function up(): void
    {
        Schema::create('fee_naming_runs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            // Null means every year the institution has collections for.
            $table->string('academic_year')->nullable();
            $table->unsignedInteger('receipt_count')->default(0);
            $table->unsignedInteger('line_count')->default(0);
            $table->decimal('total_amount', 12, 2)->default(0);
            $table->uuid('created_by')->nullable();
            $table->timestamp('reverted_at')->nullable();
            $table->uuid('reverted_by')->nullable();
            $table->timestamps();

            $table->index(['institution_id', 'created_at']);
        });

        Schema::table('student_payments', function (Blueprint $table) {
            // Which run named this line, so a run can be undone as a unit.
            $table->uuid('fee_naming_run_id')->nullable()->after('remarks');
            /**
             * Set only on the row that already existed and was renamed in place, and holds
             * what it was worth before. Its siblings in the same run were inserted by the
             * run and carry null, so an undo can tell "restore this one to this amount"
             * from "delete this one" without a second table.
             */
            $table->decimal('fee_naming_original_amount', 12, 2)->nullable()->after('fee_naming_run_id');

            $table->index('fee_naming_run_id');
        });
    }

    public function down(): void
    {
        Schema::table('student_payments', function (Blueprint $table) {
            $table->dropIndex(['fee_naming_run_id']);
            $table->dropColumn(['fee_naming_run_id', 'fee_naming_original_amount']);
        });

        Schema::dropIfExists('fee_naming_runs');
    }
};
