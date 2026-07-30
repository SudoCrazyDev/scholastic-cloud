<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollCompensationDeduction;
use App\Models\PayrollDeductionType;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\PayrollService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A deduction type can be a percentage of salary rather than a fixed peso
 * figure — SSS is "5% of the basic salary".
 *
 * The point of the basic-pay basis is that the contribution does not move with
 * attendance: being late, absent or on unpaid leave must not shrink what is
 * remitted. The gross-pay basis is the opposite choice, for deductions that
 * should follow what was actually paid out.
 */
class PercentageDeductionTypeTest extends TestCase
{
    use RefreshDatabase;

    /**
     * 1–15 July 2026 holds 11 weekdays. Nobody in this test has a staff
     * schedule, so weekdays are the scheduled working days and weekends the
     * rest days: 11 × ₱1,000 = ₱11,000 of basic pay.
     */
    private const BASIC_PAY = 11000.0;

    private Institution $institution;

    private PayrollCompensation $teacher;

    private PayrollCompensation $aide;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

        $admin = User::factory()->create([
            'email' => 'principal@percent.test',
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $admin->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->teacher = $this->compensationFor('Teacher');
        $this->aide = $this->compensationFor('Aide');
    }

    private function compensationFor(string $designation): PayrollCompensation
    {
        $staff = User::factory()->create(['email' => strtolower($designation).'@percent.test']);
        UserInstitution::factory()->create([
            'user_id' => $staff->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
        ]);

        return PayrollCompensation::create([
            'institution_id' => $this->institution->id,
            'user_id' => $staff->id,
            'designation' => $designation,
            'daily_rate' => 1000,
            'hours_per_day' => 8,
        ]);
    }

    private function sssType(array $overrides = []): PayrollDeductionType
    {
        return PayrollDeductionType::create(array_merge([
            'institution_id' => $this->institution->id,
            'name' => 'SSS',
            'calculation_type' => PayrollDeductionType::CALC_PERCENTAGE,
            'rate_percent' => 5,
            'percent_basis' => PayrollDeductionType::BASIS_BASIC_PAY,
            'is_active' => true,
        ], $overrides));
    }

    private function generate(): PayrollPeriod
    {
        $period = PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026 1st half',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-15',
            'status' => 'draft',
        ]);

        app(PayrollService::class)->generateForPeriod($period);

        return $period;
    }

    private function payslipFor(PayrollPeriod $period, PayrollCompensation $compensation): Payslip
    {
        return $period->payslips()->where('user_id', $compensation->user_id)->firstOrFail();
    }

    public function test_a_percentage_type_hands_its_rates_to_every_employee(): void
    {
        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payroll-deduction-types', [
                'name' => 'SSS',
                'calculation_type' => 'percentage',
                'rate_percent' => 5,
                'has_employer_share' => true,
                'employer_rate_percent' => 10,
                'percent_basis' => 'basic_pay',
            ])
            ->assertCreated()
            ->json();

        $this->assertStringContainsString('applied to 2 employees', $response['message']);

        $row = PayrollCompensationDeduction::where('deduction_type_id', $response['data']['id'])
            ->where('payroll_compensation_id', $this->teacher->id)
            ->firstOrFail();

        // The rates are what carry; the peso columns stay empty because the
        // amount is not knowable until a payslip has a salary.
        $this->assertSame(5.0, (float) $row->rate_percent);
        $this->assertSame(10.0, (float) $row->employer_rate_percent);
        $this->assertSame(0.0, (float) $row->amount);
        $this->assertSame(0.0, (float) $row->employer_amount);
    }

    public function test_generate_charges_the_rate_against_basic_pay(): void
    {
        $this->sssType(['has_employer_share' => true, 'employer_rate_percent' => 10]);

        $payslip = $this->payslipFor($this->generate(), $this->teacher);
        $line = $payslip->deductions()->firstOrFail();

        $this->assertSame(self::BASIC_PAY, (float) $payslip->basic_pay);
        // Nobody punched in, so nothing was earned — and the contribution is
        // charged anyway. That is the whole point of the basic-pay basis.
        $this->assertSame(0.0, (float) $payslip->gross_pay);

        $this->assertSame(550.0, (float) $line->amount);
        $this->assertSame(1100.0, (float) $line->employer_amount);
        $this->assertSame(self::BASIC_PAY, (float) $line->basis_amount);
        $this->assertSame(5.0, (float) $line->rate_percent);
        $this->assertSame('SSS', $line->name);
        $this->assertSame(550.0, (float) $payslip->total_deductions);
    }

    public function test_basic_pay_ignores_lates_and_absences(): void
    {
        $this->sssType();

        $period = $this->generate();
        $payslip = $this->payslipFor($period, $this->teacher);

        // Two days worked, one of them with a penalty: the salary earned moves,
        // the basic pay does not, so the contribution holds.
        $days = $payslip->days()->where('is_rest_day', false)->take(2)->get();
        $days[0]->update(['amount_earned' => 1000, 'hours_worked' => 8]);
        $days[1]->update(['amount_earned' => 850, 'hours_worked' => 8, 'late_minutes' => 30, 'penalty_amount' => 150]);

        app(PayrollService::class)->recomputeTotals($payslip->fresh());
        $payslip->refresh();

        $this->assertSame(1850.0, (float) $payslip->gross_pay);
        $this->assertSame(self::BASIC_PAY, (float) $payslip->basic_pay);
        $this->assertSame(550.0, (float) $payslip->deductions()->firstOrFail()->amount);
    }

    public function test_the_gross_basis_follows_what_was_actually_earned(): void
    {
        $this->sssType([
            'name' => 'Withholding',
            'percent_basis' => PayrollDeductionType::BASIS_GROSS_PAY,
            'rate_percent' => 5,
        ]);

        $period = $this->generate();
        $payslip = $this->payslipFor($period, $this->teacher);

        // Nothing earned yet, so nothing is taken.
        $this->assertSame(0.0, (float) $payslip->deductions()->firstOrFail()->amount);

        $days = $payslip->days()->where('is_rest_day', false)->take(2)->get();
        $days[0]->update(['amount_earned' => 1000, 'hours_worked' => 8]);
        $days[1]->update(['amount_earned' => 1000, 'hours_worked' => 8]);

        app(PayrollService::class)->recomputeTotals($payslip->fresh());

        $line = $payslip->deductions()->firstOrFail();
        $this->assertSame(2000.0, (float) $payslip->fresh()->gross_pay);
        $this->assertSame(100.0, (float) $line->amount);
        $this->assertSame(2000.0, (float) $line->basis_amount);
    }

    public function test_a_zero_rate_exempts_one_staff_member(): void
    {
        $type = $this->sssType();

        PayrollCompensationDeduction::create([
            'payroll_compensation_id' => $this->aide->id,
            'deduction_type_id' => $type->id,
            'rate_percent' => 0,
            'employer_rate_percent' => 0,
        ]);

        $period = $this->generate();

        $this->assertSame(550.0, (float) $this->payslipFor($period, $this->teacher)->total_deductions);
        $this->assertSame(0, $this->payslipFor($period, $this->aide)->deductions()->count());
    }

    public function test_a_staff_members_own_rate_wins_over_the_type_default(): void
    {
        $type = $this->sssType();

        PayrollCompensationDeduction::create([
            'payroll_compensation_id' => $this->aide->id,
            'deduction_type_id' => $type->id,
            'rate_percent' => 3,
        ]);

        $period = $this->generate();

        $this->assertSame(550.0, (float) $this->payslipFor($period, $this->teacher)->total_deductions);
        $this->assertSame(330.0, (float) $this->payslipFor($period, $this->aide)->total_deductions);
    }

    public function test_switching_a_type_to_percentage_clears_its_peso_default(): void
    {
        $typeId = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payroll-deduction-types', ['name' => 'SSS', 'default_amount' => 500])
            ->assertCreated()
            ->json('data.id');

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payroll-deduction-types/{$typeId}", [
                'name' => 'SSS',
                'calculation_type' => 'percentage',
                'rate_percent' => 5,
                'apply_to_all_staff' => true,
            ])
            ->assertOk();

        $type = PayrollDeductionType::findOrFail($typeId);

        // A leftover ₱500 would otherwise be charged on top of the 5%.
        $this->assertSame(0.0, (float) $type->default_amount);
        $this->assertSame(5.0, (float) $type->rate_percent);

        $row = PayrollCompensationDeduction::where('deduction_type_id', $typeId)
            ->where('payroll_compensation_id', $this->teacher->id)
            ->firstOrFail();
        $this->assertSame(0.0, (float) $row->amount);
        $this->assertSame(5.0, (float) $row->rate_percent);

        $this->assertSame(550.0, (float) $this->payslipFor($this->generate(), $this->teacher)->total_deductions);
    }

    public function test_editing_a_payslips_rate_recomputes_its_peso(): void
    {
        $this->sssType();
        $payslip = $this->payslipFor($this->generate(), $this->teacher);

        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payslips/{$payslip->id}", [
                'deductions' => [[
                    'deduction_type_id' => $payslip->deductions()->firstOrFail()->deduction_type_id,
                    'name' => 'SSS',
                    'calculation_type' => 'percentage',
                    'amount' => 0,
                    'rate_percent' => 10,
                    'percent_basis' => 'basic_pay',
                ]],
            ])
            ->assertOk()
            ->json('data');

        $this->assertSame(1100.0, (float) $response['deductions'][0]['amount']);
        $this->assertSame(10.0, (float) $response['deductions'][0]['rate_percent']);
        $this->assertSame(self::BASIC_PAY, (float) $response['deductions'][0]['basis_amount']);
        $this->assertSame(1100.0, (float) $response['total_deductions']);
    }

    public function test_a_percentage_line_removed_from_a_payslip_stays_removed(): void
    {
        $this->sssType();
        $payslip = $this->payslipFor($this->generate(), $this->teacher);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payslips/{$payslip->id}", ['deductions' => []])
            ->assertOk();

        // recomputeTotals reprices the lines that are there; it must not put
        // one back that a payroll manager deleted.
        $this->assertSame(0, $payslip->fresh()->deductions()->count());
        $this->assertSame(0.0, (float) $payslip->fresh()->total_deductions);
    }

    public function test_an_edited_daily_rate_moves_the_contribution(): void
    {
        $this->sssType();
        $payslip = $this->payslipFor($this->generate(), $this->teacher);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payslips/{$payslip->id}", ['daily_rate' => 2000])
            ->assertOk();

        $payslip->refresh();

        $this->assertSame(22000.0, (float) $payslip->basic_pay);
        $this->assertSame(1100.0, (float) $payslip->deductions()->firstOrFail()->amount);
    }

    public function test_fixed_types_are_untouched_by_all_of_this(): void
    {
        PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => 'Cash Advance',
            'default_amount' => 150,
            'is_active' => true,
        ]);

        $payslip = $this->payslipFor($this->generate(), $this->teacher);
        $line = $payslip->deductions()->firstOrFail();

        $this->assertSame(PayrollDeductionType::CALC_FIXED, $line->calculation_type);
        $this->assertSame(150.0, (float) $line->amount);
        $this->assertSame(0.0, (float) $line->rate_percent);
        $this->assertNull($line->percent_basis);
        $this->assertSame(150.0, (float) $payslip->total_deductions);
    }

    public function test_the_rates_list_reports_the_rate_rather_than_a_peso(): void
    {
        $this->sssType(['has_employer_share' => true, 'employer_rate_percent' => 10]);

        $rows = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/payroll-compensations')
            ->assertOk()
            ->json('data');

        $line = collect($rows)->firstWhere('user_id', $this->teacher->user_id)['compensation']['deductions'][0];

        $this->assertSame('percentage', $line['calculation_type']);
        $this->assertSame(5.0, (float) $line['rate_percent']);
        $this->assertSame(10.0, (float) $line['employer_rate_percent']);
        $this->assertSame('basic_pay', $line['percent_basis']);
        $this->assertTrue($line['from_default']);
        // No payroll period here, so there is nothing to take a percentage of.
        $this->assertSame(0.0, (float) $line['amount']);
    }
}
