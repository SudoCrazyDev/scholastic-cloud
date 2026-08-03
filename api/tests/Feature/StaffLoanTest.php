<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\Role;
use App\Models\StaffLoan;
use App\Models\StaffLoanEvent;
use App\Models\StaffLoanInstallment;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\PayrollService;
use App\Services\StaffLoanService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A deduction that ends.
 *
 * The catalog deductions run forever; a loan runs for a fixed number of months
 * and then stops on its own. What is tested here is the arithmetic the school
 * signs off on, and the two places the balance moves: a released period takes
 * an installment, and a reopened one gives it back.
 */
class StaffLoanTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private User $admin;

    /** ₱1,000/day. 1–31 July 2026 holds 23 weekdays → ₱23,000 basic pay. */
    private PayrollCompensation $teacher;

    protected function setUp(): void
    {
        parent::setUp();

        // Pinned before the periods under test so every working day is priced
        // from the schedule rather than read as an absence. Attendance is not
        // what these tests are about, and a suite whose gross pay depends on
        // the day it is run is no test at all.
        $this->travelTo('2026-06-30 10:00:00');

        $this->institution = Institution::factory()->create();
        // A system role arrives with its built-in access, which is where
        // payroll.manage and payroll.approve-loan come from.
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

        $this->admin = User::factory()->create([
            'first_name' => 'Ana',
            'last_name' => 'Reyes',
            'email' => 'admin@loan.test',
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->admin->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $staff = User::factory()->create(['email' => 'teacher@loan.test']);
        UserInstitution::factory()->create([
            'user_id' => $staff->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
        ]);

        $this->teacher = PayrollCompensation::create([
            'institution_id' => $this->institution->id,
            'user_id' => $staff->id,
            'designation' => 'Teacher',
            'daily_rate' => 1000,
            'hours_per_day' => 8,
        ]);
    }

    private function service(): StaffLoanService
    {
        return app(StaffLoanService::class);
    }

    /**
     * A loan, approved unless told otherwise, with the schedule written.
     */
    private function loan(array $overrides = [], bool $approve = true): StaffLoan
    {
        $loan = StaffLoan::create(array_merge([
            'institution_id' => $this->institution->id,
            'user_id' => $this->teacher->user_id,
            'reference_no' => $this->service()->nextReference($this->institution->id),
            'principal_amount' => 6000,
            'interest_method' => StaffLoan::INTEREST_NONE,
            'interest_rate_percent' => 0,
            'rate_period' => StaffLoan::RATE_MONTHLY,
            'term_months' => 12,
            'first_deduction_date' => '2026-07-15',
            'status' => $approve ? StaffLoan::STATUS_APPROVED : StaffLoan::STATUS_PENDING,
            'requested_by' => $this->admin->id,
        ], $overrides));

        $this->service()->writeSchedule($loan);

        return $loan->refresh();
    }

    private function period(string $name = 'July 2026', string $from = '2026-07-01', string $to = '2026-07-31'): PayrollPeriod
    {
        $period = PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => $name,
            'date_from' => $from,
            'date_to' => $to,
            'status' => 'draft',
        ]);

        app(PayrollService::class)->generateForPeriod($period);

        return $period;
    }

    private function payslip(PayrollPeriod $period): Payslip
    {
        return $period->payslips()->where('user_id', $this->teacher->user_id)->firstOrFail();
    }

    public function test_an_interest_free_loan_splits_evenly_and_closes_at_zero(): void
    {
        $quote = $this->service()->quote(6000, StaffLoan::INTEREST_NONE, 0, StaffLoan::RATE_MONTHLY, 12, Carbon::parse('2026-07-15'));

        $this->assertSame(0.0, $quote['interest']);
        $this->assertSame(6000.0, $quote['total']);
        $this->assertSame(500.0, $quote['installment']);
        $this->assertCount(12, $quote['installments']);
        $this->assertSame(6000.0, round(array_sum(array_column($quote['installments'], 'amount')), 2));
        $this->assertSame(0.0, end($quote['installments'])['closing_balance']);
    }

    public function test_add_on_interest_is_charged_once_on_the_whole_principal(): void
    {
        // ₱6,000 at 1% a month for 12 months: ₱720 of interest however fast it
        // is paid down, so every installment is ₱560.
        $quote = $this->service()->quote(6000, StaffLoan::INTEREST_ADD_ON, 1, StaffLoan::RATE_MONTHLY, 12, Carbon::parse('2026-07-15'));

        $this->assertSame(720.0, $quote['interest']);
        $this->assertSame(6720.0, $quote['total']);
        $this->assertSame(560.0, $quote['installment']);
        $this->assertSame(500.0, $quote['installments'][0]['principal_component']);
        $this->assertSame(60.0, $quote['installments'][0]['interest_component']);
        // Identical month to month — that is what "add-on" means.
        $this->assertSame(560.0, $quote['installments'][11]['amount']);
    }

    public function test_an_annual_rate_is_twelfths_of_itself(): void
    {
        $annual = $this->service()->quote(6000, StaffLoan::INTEREST_ADD_ON, 12, StaffLoan::RATE_ANNUAL, 12, Carbon::parse('2026-07-15'));
        $monthly = $this->service()->quote(6000, StaffLoan::INTEREST_ADD_ON, 1, StaffLoan::RATE_MONTHLY, 12, Carbon::parse('2026-07-15'));

        $this->assertSame($monthly['total'], $annual['total']);
    }

    public function test_diminishing_interest_shifts_the_split_and_still_closes_at_zero(): void
    {
        $quote = $this->service()->quote(6000, StaffLoan::INTEREST_DIMINISHING, 1, StaffLoan::RATE_MONTHLY, 12, Carbon::parse('2026-07-15'));

        // Interest on the balance, so the first month is charged on the full
        // ₱6,000 and the last on almost nothing.
        $this->assertSame(60.0, $quote['installments'][0]['interest_component']);
        $this->assertLessThan(
            $quote['installments'][0]['interest_component'],
            $quote['installments'][11]['interest_component']
        );
        // Cheaper than the add-on loan at the same quoted rate.
        $this->assertLessThan(720.0, $quote['interest']);

        // The schedule accounts for every centavo of principal and closes flat.
        $this->assertSame(6000.0, round(array_sum(array_column($quote['installments'], 'principal_component')), 2));
        $this->assertSame(0.0, end($quote['installments'])['closing_balance']);
        $this->assertSame(
            $quote['total'],
            round(array_sum(array_column($quote['installments'], 'amount')), 2)
        );
    }

    public function test_a_term_that_does_not_divide_evenly_lands_the_remainder_on_the_last_month(): void
    {
        $quote = $this->service()->quote(1000, StaffLoan::INTEREST_NONE, 0, StaffLoan::RATE_MONTHLY, 3, Carbon::parse('2026-07-15'));

        $this->assertSame(333.33, $quote['installments'][0]['amount']);
        $this->assertSame(333.34, $quote['installments'][2]['amount']);
        $this->assertSame(1000.0, round(array_sum(array_column($quote['installments'], 'amount')), 2));
    }

    public function test_only_an_approved_loan_reaches_a_payslip(): void
    {
        $this->loan(approve: false);

        $line = $this->payslip($this->period())->deductions()->whereNotNull('staff_loan_id')->first();

        $this->assertNull($line);
    }

    public function test_an_approved_loan_lands_on_the_payslip_as_a_numbered_installment(): void
    {
        $loan = $this->loan(['interest_method' => StaffLoan::INTEREST_ADD_ON, 'interest_rate_percent' => 1]);
        $payslip = $this->payslip($this->period());

        $line = $payslip->deductions()->whereNotNull('staff_loan_id')->firstOrFail();

        $this->assertSame(560.0, (float) $line->amount);
        $this->assertSame('Loan '.$loan->reference_no.' (1/12)', $line->name);
        // The school is being repaid, not co-paying: nothing under benefits.
        $this->assertSame(0.0, (float) $line->employer_amount);
        // ₱23,000 of salary less the installment.
        $this->assertSame(22440.0, (float) $payslip->fresh()->net_pay);
    }

    public function test_a_draft_period_has_not_collected_anything_yet(): void
    {
        $loan = $this->loan();
        $this->period();

        $this->assertSame(0.0, (float) $loan->fresh()->amount_paid);
        $this->assertSame(
            StaffLoanInstallment::STATUS_SCHEDULED,
            $loan->installments()->first()->status
        );
    }

    public function test_finalising_the_period_collects_the_installment(): void
    {
        $loan = $this->loan();
        $period = $this->period();

        $this->service()->collectForPeriod($period, $this->admin);

        $loan->refresh();
        $this->assertSame(500.0, (float) $loan->amount_paid);
        $this->assertSame(5500.0, $loan->balance());
        $this->assertSame(StaffLoan::STATUS_APPROVED, $loan->status);

        $first = $loan->installments()->first();
        $this->assertSame(StaffLoanInstallment::STATUS_COLLECTED, $first->status);
        $this->assertSame($period->id, $first->payroll_period_id);

        $this->assertDatabaseHas('staff_loan_events', [
            'staff_loan_id' => $loan->id,
            'action' => StaffLoanEvent::ACTION_COLLECTED,
            'actor_name' => 'Ana Reyes',
        ]);
    }

    public function test_reopening_the_period_gives_the_collection_back(): void
    {
        $loan = $this->loan();
        $period = $this->period();

        $this->service()->collectForPeriod($period, $this->admin);
        $this->service()->releaseForPeriod($period, $this->admin);

        $loan->refresh();
        $this->assertSame(0.0, (float) $loan->amount_paid);
        $this->assertSame(
            StaffLoanInstallment::STATUS_SCHEDULED,
            $loan->installments()->first()->status
        );
    }

    public function test_an_installment_already_on_another_period_is_not_collected_twice(): void
    {
        $this->loan();

        // Two overlapping periods, both reaching past the 15th. The second is
        // generated while the first still carries the installment.
        $first = $this->period('July 2026', '2026-07-01', '2026-07-31');
        $second = $this->period('July 2026 (rerun)', '2026-07-01', '2026-07-31');

        $this->assertSame(1, $this->payslip($first)->deductions()->whereNotNull('staff_loan_id')->count());
        $this->assertSame(0, $this->payslip($second)->deductions()->whereNotNull('staff_loan_id')->count());
    }

    public function test_regenerating_the_same_period_places_the_installment_again(): void
    {
        $this->loan();
        $period = $this->period();

        // The period's own payslips are rebuilt, so its own lines are not a
        // reason to skip the installment.
        app(PayrollService::class)->generateForPeriod($period);

        $this->assertSame(1, $this->payslip($period)->deductions()->whereNotNull('staff_loan_id')->count());
    }

    public function test_a_missed_payroll_run_catches_up_the_installments_it_skipped(): void
    {
        $this->loan();

        // Nothing was run in July or August; September's period is the first,
        // and three installments are due by the end of it.
        $period = $this->period('September 2026', '2026-09-01', '2026-09-30');

        $this->assertSame(3, $this->payslip($period)->deductions()->whereNotNull('staff_loan_id')->count());
    }

    public function test_the_last_installment_completes_the_loan(): void
    {
        $loan = $this->loan(['term_months' => 1]);
        $period = $this->period();

        $this->service()->collectForPeriod($period, $this->admin);

        $loan->refresh();
        $this->assertSame(StaffLoan::STATUS_COMPLETED, $loan->status);
        $this->assertSame(0.0, $loan->balance());
        $this->assertNotNull($loan->completed_at);
        $this->assertDatabaseHas('staff_loan_events', [
            'staff_loan_id' => $loan->id,
            'action' => StaffLoanEvent::ACTION_COMPLETED,
        ]);
    }

    public function test_reopening_a_period_reverses_a_completion(): void
    {
        $loan = $this->loan(['term_months' => 1]);
        $period = $this->period();

        $this->service()->collectForPeriod($period, $this->admin);
        $this->service()->releaseForPeriod($period, $this->admin);

        $loan->refresh();
        $this->assertSame(StaffLoan::STATUS_APPROVED, $loan->status);
        $this->assertNull($loan->completed_at);
    }

    public function test_cancelling_strikes_out_the_tail_but_keeps_what_was_collected(): void
    {
        $loan = $this->loan();
        $period = $this->period();
        $this->service()->collectForPeriod($period, $this->admin);

        $this->service()->cancel($loan->refresh(), $this->admin, 'Settled in cash.');

        $loan->refresh();
        $this->assertSame(StaffLoan::STATUS_CANCELLED, $loan->status);
        // The one collection stands; the other eleven never happen.
        $this->assertSame(500.0, (float) $loan->amount_paid);
        $this->assertSame(1, $loan->installments()->where('status', StaffLoanInstallment::STATUS_COLLECTED)->count());
        $this->assertSame(11, $loan->installments()->where('status', StaffLoanInstallment::STATUS_CANCELLED)->count());
    }

    public function test_a_cancelled_loan_stops_reaching_payslips(): void
    {
        $loan = $this->loan();
        $this->service()->cancel($loan, $this->admin, 'Resigned.');

        $period = $this->period();

        $this->assertSame(0, $this->payslip($period)->deductions()->whereNotNull('staff_loan_id')->count());
    }

    public function test_editing_a_payslip_never_drops_its_loan_lines(): void
    {
        $this->loan();
        $period = $this->period();
        $payslip = $this->payslip($period);

        // A save that sends only the catalog deductions — which is every save
        // the editor makes, since it never sends loan rows back.
        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson('/api/payslips/'.$payslip->id, [
                'deductions' => [
                    ['deduction_type_id' => null, 'name' => 'Uniform', 'amount' => 250],
                ],
            ]);

        $response->assertOk();
        $payslip->refresh();
        $this->assertSame(1, $payslip->deductions()->whereNotNull('staff_loan_id')->count());
        $this->assertSame(750.0, (float) $payslip->total_deductions);
    }

    public function test_the_api_records_a_loan_as_pending_and_names_who_added_it(): void
    {
        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/staff-loans', [
                'user_id' => $this->teacher->user_id,
                'purpose' => 'Emergency medical assistance',
                'principal_amount' => 6000,
                'interest_method' => 'add_on',
                'interest_rate_percent' => 1,
                'rate_period' => 'monthly',
                'term_months' => 12,
                'first_deduction_date' => '2026-07-15',
            ])
            ->assertCreated();

        $data = $response->json('data');

        // Priced on the way in: an approver signs off a peso figure, not a rate.
        $this->assertSame('pending', $data['status']);
        $this->assertSame(720.0, $data['interest_amount']);
        $this->assertSame(6720.0, $data['total_payable']);
        $this->assertSame(560.0, $data['installment_amount']);
        $this->assertCount(12, $data['installments']);

        // Who put the deduction on the staff member's salary.
        $this->assertSame('Ana Reyes', $data['requested_by_name']);
        $this->assertDatabaseHas('staff_loan_events', [
            'action' => StaffLoanEvent::ACTION_CREATED,
            'actor_id' => $this->admin->id,
            'actor_name' => 'Ana Reyes',
        ]);

        // Nothing is collected yet — approval is a separate act.
        $this->assertSame(0, $this->payslip($this->period())->deductions()->whereNotNull('staff_loan_id')->count());
    }

    public function test_encoding_a_loan_does_not_carry_the_right_to_approve_it(): void
    {
        // A school-built payroll role: it can encode, but nobody gave it the
        // approval ability.
        $clerk = Role::factory()->create([
            'title' => 'Payroll Clerk',
            'slug' => 'payroll-clerk',
            'institution_id' => $this->institution->id,
        ]);
        $clerk->syncPermissions(['payroll.view', 'payroll.manage']);

        $user = User::factory()->create([
            'email' => 'clerk@loan.test',
            'token' => 'clerk-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'role_id' => $clerk->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $loan = $this->loan(approve: false);

        $this->withHeader('Authorization', 'Bearer clerk-token')
            ->postJson('/api/staff-loans/'.$loan->id.'/approve')
            ->assertForbidden();

        $this->assertSame(StaffLoan::STATUS_PENDING, $loan->fresh()->status);

        // The approver can.
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/staff-loans/'.$loan->id.'/approve')
            ->assertOk();

        $loan->refresh();
        $this->assertSame(StaffLoan::STATUS_APPROVED, $loan->status);
        $this->assertSame($this->admin->id, $loan->reviewed_by);
    }

    public function test_an_approved_loan_can_no_longer_be_edited(): void
    {
        $loan = $this->loan();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson('/api/staff-loans/'.$loan->id, [
                'user_id' => $this->teacher->user_id,
                'principal_amount' => 99000,
                'interest_method' => 'none',
                'term_months' => 12,
                'first_deduction_date' => '2026-07-15',
            ])
            ->assertStatus(422);

        $this->assertSame(6000.0, (float) $loan->fresh()->principal_amount);
    }

    public function test_references_are_sequential_per_school(): void
    {
        $this->assertSame('LN-0001', $this->service()->nextReference($this->institution->id));

        $this->loan();

        $this->assertSame('LN-0002', $this->service()->nextReference($this->institution->id));
    }
}
