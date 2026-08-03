<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A deduction that ends.
 *
 * Every deduction payroll knows about so far runs forever: SSS comes off every
 * payslip until somebody turns it off. A loan is the opposite — a school lends
 * a staff member ₱6,000, it is collected at ₱560 a month, and after the twelfth
 * collection it must stop on its own. Nothing in the deduction catalog can
 * express "twelve times and then never again", and a cash-advance type nobody
 * remembers to switch off keeps taking money.
 *
 * So a loan is its own record with three parts:
 *
 *  - `staff_loans` — what was borrowed, on what terms, and where it stands.
 *  - `staff_loan_installments` — the amortization schedule, written out in
 *    full the moment the loan is approved. Each row is one collection: what it
 *    costs, how much of it is principal, how much interest, and which payslip
 *    finally took it. Writing the schedule down rather than deriving it means a
 *    rate change later can never silently rewrite what somebody already paid.
 *  - `staff_loan_events` — who did what to it. Money leaving a salary needs a
 *    name against it: who encoded the loan, who approved it, who called it off.
 *
 * A payslip line points back at the installment it collected, which is what
 * lets finalising a period mark the schedule paid and reopening it put the
 * money back.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_loans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            // The borrower. Not the compensation record: a loan outlives a
            // change of rates, and is owed by the person either way.
            $table->uuid('user_id');
            // Human handle for the loan — "LN-0007". Sequential per school so
            // it can be quoted on a payslip and found again.
            $table->string('reference_no', 40);
            $table->string('purpose')->nullable();

            $table->decimal('principal_amount', 12, 2);
            // 'none', 'add_on' (flat interest on the principal, split evenly)
            // or 'diminishing' (interest charged on the balance that is left).
            $table->string('interest_method', 20)->default('none');
            $table->decimal('interest_rate_percent', 6, 3)->default(0);
            // Whether the rate above is quoted per month or per year.
            $table->string('rate_period', 10)->default('monthly');
            $table->unsignedSmallInteger('term_months');

            // What the terms above worked out to, snapshotted at approval so
            // the figures on the schedule and the figures on the loan can never
            // drift apart.
            $table->decimal('interest_amount', 12, 2)->default(0);
            $table->decimal('total_payable', 12, 2)->default(0);
            // The level per-month figure. The last installment may differ by a
            // centavo or two — rounding has to land somewhere.
            $table->decimal('installment_amount', 12, 2)->default(0);
            $table->decimal('amount_paid', 12, 2)->default(0);

            // The month the first collection is due. Everything after it is one
            // month apart.
            $table->date('first_deduction_date');

            // pending → approved → completed, or rejected / cancelled.
            $table->string('status', 20)->default('pending');

            // Who encoded it, and who signed it off. Both are kept even after
            // the loan is paid: this is the audit trail the money rests on.
            $table->uuid('requested_by')->nullable();
            $table->uuid('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('requested_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['institution_id', 'reference_no'], 'staff_loans_institution_reference_unique');
            $table->index(['institution_id', 'status'], 'staff_loans_institution_status_idx');
            $table->index(['user_id', 'status'], 'staff_loans_user_status_idx');
        });

        Schema::create('staff_loan_installments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('staff_loan_id');
            // 1-based: "3 of 12", which is how it reads on the payslip.
            $table->unsignedSmallInteger('sequence');
            $table->date('due_date');

            $table->decimal('amount', 12, 2);
            // The split is stored rather than derived because a diminishing
            // loan's split changes every month, and a payslip reprinted years
            // later should still be able to say how much of it was interest.
            $table->decimal('principal_component', 12, 2)->default(0);
            $table->decimal('interest_component', 12, 2)->default(0);
            $table->decimal('opening_balance', 12, 2)->default(0);
            $table->decimal('closing_balance', 12, 2)->default(0);

            // scheduled → collected. 'cancelled' is what the unpaid tail
            // becomes when a loan is called off part-way through.
            $table->string('status', 20)->default('scheduled');
            $table->decimal('collected_amount', 12, 2)->default(0);
            $table->timestamp('collected_at')->nullable();
            // The payslip that actually took it. Null until a period carrying
            // this installment is finalised.
            $table->uuid('payslip_id')->nullable();
            $table->uuid('payroll_period_id')->nullable();
            $table->timestamps();

            $table->foreign('staff_loan_id')->references('id')->on('staff_loans')->cascadeOnDelete();
            // A payslip deleted by a regenerate must not take the schedule with
            // it — the installment simply goes back to being uncollected.
            $table->foreign('payslip_id')->references('id')->on('payslips')->nullOnDelete();
            $table->foreign('payroll_period_id')->references('id')->on('payroll_periods')->nullOnDelete();
            $table->unique(['staff_loan_id', 'sequence'], 'staff_loan_installments_loan_sequence_unique');
            $table->index(['status', 'due_date'], 'staff_loan_installments_status_due_idx');
        });

        Schema::create('staff_loan_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('staff_loan_id');
            // 'created', 'updated', 'approved', 'rejected', 'cancelled',
            // 'collected', 'released', 'completed'.
            $table->string('action', 30);
            // Null when payroll itself did it (a collection at finalise is
            // recorded against the person who released the period, so this is
            // only null for a user since deleted).
            $table->uuid('actor_id')->nullable();
            // The actor's name as it read at the time. A staff member can be
            // removed; the trail has to survive them.
            $table->string('actor_name')->nullable();
            $table->decimal('amount', 12, 2)->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->foreign('staff_loan_id')->references('id')->on('staff_loans')->cascadeOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['staff_loan_id', 'created_at'], 'staff_loan_events_loan_created_idx');
        });

        // What a payslip line was collecting. A loan line is not a catalog
        // deduction — it has no type — so without these two columns there would
        // be no way back from the payslip to the schedule it paid down.
        Schema::table('payslip_deductions', function (Blueprint $table) {
            $table->uuid('staff_loan_id')->nullable()->after('deduction_type_id');
            $table->uuid('staff_loan_installment_id')->nullable()->after('staff_loan_id');

            $table->foreign('staff_loan_id')->references('id')->on('staff_loans')->nullOnDelete();
            $table->foreign('staff_loan_installment_id')->references('id')->on('staff_loan_installments')->nullOnDelete();
            $table->index('staff_loan_installment_id', 'payslip_deductions_loan_installment_idx');
        });
    }

    public function down(): void
    {
        Schema::table('payslip_deductions', function (Blueprint $table) {
            $table->dropForeign(['staff_loan_installment_id']);
            $table->dropForeign(['staff_loan_id']);
            $table->dropIndex('payslip_deductions_loan_installment_idx');
            $table->dropColumn(['staff_loan_id', 'staff_loan_installment_id']);
        });

        Schema::dropIfExists('staff_loan_events');
        Schema::dropIfExists('staff_loan_installments');
        Schema::dropIfExists('staff_loans');
    }
};
