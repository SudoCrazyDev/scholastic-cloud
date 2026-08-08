<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The record that a year's money data was deleted on purpose.
 *
 * Clearing Finance data destroys receipts, and a receipt is the one record a
 * school may later be asked to produce. Once the rows are gone the only thing
 * left to answer "where did 2025-2026's collections go?" is this table, so it
 * is written in the same transaction as the delete and never cleared by it.
 *
 * `deleted_counts` is the per-table tally rather than a total, because that is
 * what makes the entry checkable: an auditor comparing it against a backup can
 * see that 412 payment lines and 118 receipts went, and that payment plans and
 * disbursements were not touched.
 *
 * The operator's name and role are **snapshotted** alongside `cleared_by`. The
 * user row can be renamed or removed later, and an audit line that resolves to
 * a dash names nobody.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance_data_clear_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');

            // The year the operator chose. Catalog groups ignore it (a fee type
            // has no year), which is why the group list is stored too — this
            // column alone does not describe the blast radius.
            $table->string('academic_year', 20);

            // Group keys as offered by FinanceDataGroups, e.g. ["payments",
            // "applied_discounts"]. Stored as given so an entry still reads
            // correctly after the catalog is reworded.
            $table->json('groups');

            // { "student_payments": 412, "payment_transactions": 118, ... }
            $table->json('deleted_counts');
            $table->unsignedInteger('total_deleted')->default(0);

            // Receipt uploads live on R2, and the object delete happens after
            // the transaction commits. Recording both counts means a mismatch
            // is visible rather than assumed.
            $table->unsignedInteger('files_deleted')->default(0);
            $table->unsignedInteger('files_failed')->default(0);

            $table->uuid('cleared_by')->nullable();
            $table->string('cleared_by_name')->nullable();
            $table->string('cleared_by_role', 100)->nullable();

            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreign('cleared_by')->references('id')->on('users')->onDelete('set null');

            $table->index(['institution_id', 'created_at']);
            $table->index(['institution_id', 'academic_year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finance_data_clear_logs');
    }
};
