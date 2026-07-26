<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-staff attendance exceptions, filed as a request and applied to
     * payroll only once approved.
     *
     * Staff file a request (early out for an emergency, official business in
     * the morning, a forgotten punch); a principal / institution-administrator
     * approves or disapproves. Payroll reads **approved** rows only and uses
     * them to waive late / undertime penalties and, where warranted, guarantee
     * the full daily rate.
     *
     * The three waive columns are derived from `kind` on create (see
     * StaffAttendanceRequest::defaultFlagsForKind) rather than chosen by the
     * requester, so staff cannot grant themselves a pay floor. An approver may
     * adjust them at approval time.
     */
    public function up(): void
    {
        Schema::create('staff_attendance_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            // The staff member the exception applies to — not necessarily the
            // requester, since an admin may file on someone's behalf.
            $table->foreignUuid('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->date('date_from');
            $table->date('date_to');
            $table->string('kind'); // late_arrival|early_out|official_business|forgot_punch

            // What payroll does with the day. See PayrollService::priceDay.
            $table->boolean('waive_late')->default(false);
            $table->boolean('waive_undertime')->default(false);
            $table->boolean('pay_full_day')->default(false);

            // Optional biometric stand-in for a day with missing punches.
            $table->time('credited_time_in')->nullable();
            $table->time('credited_time_out')->nullable();

            $table->text('reason');
            $table->string('status')->default('pending'); // pending|approved|disapproved|cancelled
            $table->text('review_note')->nullable();
            $table->foreignUuid('requested_by')->nullable()->references('id')->on('users')->nullOnDelete();
            $table->foreignUuid('reviewed_by')->nullable()->references('id')->on('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            // Payroll's lookup: approved rows for a set of staff overlapping a period.
            $table->index(['institution_id', 'status', 'date_from'], 'staff_att_req_inst_status_from_idx');
            $table->index(['user_id', 'date_from'], 'staff_att_req_user_from_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_attendance_requests');
    }
};
