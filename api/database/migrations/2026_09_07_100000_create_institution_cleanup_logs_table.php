<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The record that a school was emptied on purpose.
 *
 * A clean-up destroys a tenant's entire operating history — receipts, grades,
 * payslips, attendance — across every academic year at once. Once it has run,
 * the only thing left to answer "where did this school's records go?" is this
 * table, so it is written in the same transaction as the deletes and is never
 * itself cleared, not even by a second clean-up of the same institution.
 *
 * `deleted_counts` is the per-table tally rather than a total, because that is
 * what makes the entry checkable against a backup: 412 payment lines, 8,900
 * running grades, 0 rows in anything holding a student or a staff member. That
 * last part is the point — the promise of a clean-up is that the people survive
 * it, and a per-table tally is how someone verifies the promise was kept rather
 * than taking it on trust.
 *
 * Deliberately **not** scoped to an academic year, unlike finance_data_clear_logs:
 * a clean-up has no year, it takes all of them.
 *
 * The operator's name and role are snapshotted alongside `cleared_by`. The user
 * row can be renamed or removed later, and an audit line that resolves to a dash
 * names nobody.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institution_cleanup_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');

            // Group keys as offered by InstitutionCleanupGroups, e.g.
            // ["finance", "hris", "structure"]. Stored as given so an entry
            // still reads correctly after the catalog is reworded.
            $table->json('groups');

            // { "student_payments": 412, "student_running_grades": 8900, ... }
            $table->json('deleted_counts');
            $table->unsignedInteger('total_deleted')->default(0);

            // Uploads live on R2, and the object delete happens after the
            // transaction commits. Recording both counts means a mismatch is
            // visible rather than assumed.
            $table->unsignedInteger('files_deleted')->default(0);
            $table->unsignedInteger('files_failed')->default(0);

            $table->uuid('cleared_by')->nullable();
            $table->string('cleared_by_name')->nullable();
            $table->string('cleared_by_role', 100)->nullable();

            $table->timestamps();

            // The institution survives its own clean-up, so this cascade only
            // fires if the tenant itself is later removed outright.
            $table->foreign('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreign('cleared_by')->references('id')->on('users')->onDelete('set null');

            $table->index(['institution_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('institution_cleanup_logs');
    }
};
