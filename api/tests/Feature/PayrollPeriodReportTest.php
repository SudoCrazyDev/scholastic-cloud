<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollDeductionType;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The period report is what a school signs cheques and remittance forms
 * against. The figure that goes out to staff, the figure withheld from them and
 * the figure the school owes on top are three different numbers, and confusing
 * the last two is how a school under-remits.
 */
class PayrollPeriodReportTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

        $admin = User::factory()->create([
            'email' => 'principal@report.test',
            'token' => 'report-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $admin->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);
    }

    private function api()
    {
        return $this->withHeader('Authorization', 'Bearer report-token');
    }

    private function period(): PayrollPeriod
    {
        return PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-31',
            'status' => 'draft',
        ]);
    }

    private function deductionType(string $name, bool $employerShare = false, int $sort = 0): PayrollDeductionType
    {
        return PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => $name,
            'calculation_type' => PayrollDeductionType::CALC_FIXED,
            'has_employer_share' => $employerShare,
            'sort_order' => $sort,
        ]);
    }

    /**
     * @param  array<int, array{type: ?PayrollDeductionType, name?: string, amount: float, employer?: float}>  $deductions
     */
    private function payslip(PayrollPeriod $period, string $email, float $gross, array $deductions): Payslip
    {
        $staff = User::factory()->create(['email' => $email]);

        $payslip = Payslip::create([
            'institution_id' => $this->institution->id,
            'payroll_period_id' => $period->id,
            'user_id' => $staff->id,
            'daily_rate' => 500,
            'hourly_rate' => 62.5,
            'hours_per_day' => 8,
            'days_worked' => 20,
            'hours_worked' => 160,
            'basic_pay' => $gross,
            'gross_pay' => $gross,
        ]);

        $withheld = 0.0;
        foreach ($deductions as $line) {
            $payslip->deductions()->create([
                'deduction_type_id' => $line['type']?->id,
                'name' => $line['name'] ?? $line['type']->name,
                'calculation_type' => PayrollDeductionType::CALC_FIXED,
                'amount' => $line['amount'],
                'employer_amount' => $line['employer'] ?? 0,
            ]);
            $withheld += $line['amount'];
        }

        $payslip->update([
            'total_deductions' => $withheld,
            'net_pay' => $gross - $withheld,
        ]);

        return $payslip->refresh();
    }

    public function test_the_report_separates_the_payout_from_both_sides_of_the_deductions(): void
    {
        $period = $this->period();
        $sss = $this->deductionType('SSS', true, 1);
        $advance = $this->deductionType('Cash Advance', false, 2);

        $this->payslip($period, 'one@report.test', 10000, [
            ['type' => $sss, 'amount' => 500, 'employer' => 1000],
            ['type' => $advance, 'amount' => 200],
        ]);
        $this->payslip($period, 'two@report.test', 8000, [
            ['type' => $sss, 'amount' => 400, 'employer' => 800],
        ]);

        $summary = $this->api()->getJson("/api/payroll-periods/{$period->id}/report")
            ->assertOk()
            ->json('data.summary');

        $this->assertSame(2, $summary['employee_count']);
        $this->assertSame(18000.0, (float) $summary['gross_total']);
        $this->assertSame(1100.0, (float) $summary['employee_deduction_total']);
        // The employer's own share never came out of anyone's pay.
        $this->assertSame(1800.0, (float) $summary['employer_contribution_total']);
        // What actually goes out to staff: salary less what was withheld.
        $this->assertSame(16900.0, (float) $summary['net_total']);
        // ...and what the period costs the school, which is more than the payout.
        $this->assertSame(19800.0, (float) $summary['payroll_cost_total']);
    }

    public function test_each_deduction_totals_both_shares_and_counts_the_staff_it_charged(): void
    {
        $period = $this->period();
        $sss = $this->deductionType('SSS', true, 1);
        $advance = $this->deductionType('Cash Advance', false, 2);

        $this->payslip($period, 'one@report.test', 10000, [
            ['type' => $sss, 'amount' => 500, 'employer' => 1000],
            ['type' => $advance, 'amount' => 200],
        ]);
        $this->payslip($period, 'two@report.test', 8000, [
            ['type' => $sss, 'amount' => 400, 'employer' => 800],
            // Exempt from the advance — a zero line is not a staff member the
            // deduction hit, so it must not inflate the headcount.
            ['type' => $advance, 'amount' => 0],
        ]);

        $lines = $this->api()->getJson("/api/payroll-periods/{$period->id}/report")
            ->assertOk()
            ->json('data.deductions');

        // Catalog order, so the report keeps its shape month to month.
        $this->assertSame(['SSS', 'Cash Advance'], array_column($lines, 'name'));

        $this->assertSame(2, $lines[0]['employee_count']);
        $this->assertSame(900.0, (float) $lines[0]['employee_amount']);
        $this->assertSame(1800.0, (float) $lines[0]['employer_amount']);
        $this->assertSame(2700.0, (float) $lines[0]['total_amount']);

        $this->assertSame(1, $lines[1]['employee_count']);
        $this->assertSame(200.0, (float) $lines[1]['employee_amount']);
        $this->assertSame(0.0, (float) $lines[1]['employer_amount']);
    }

    public function test_two_lines_of_the_same_deduction_on_one_payslip_count_one_staff_member(): void
    {
        $period = $this->period();
        $advance = $this->deductionType('Cash Advance', false, 1);

        // A staff member charged twice for the same thing in one period.
        $this->payslip($period, 'one@report.test', 10000, [
            ['type' => $advance, 'amount' => 200],
            ['type' => $advance, 'amount' => 300],
        ]);

        $lines = $this->api()->getJson("/api/payroll-periods/{$period->id}/report")
            ->assertOk()
            ->json('data.deductions');

        $this->assertCount(1, $lines);
        $this->assertSame(1, $lines[0]['employee_count']);
        $this->assertSame(500.0, (float) $lines[0]['employee_amount']);
    }

    public function test_an_ad_hoc_line_reports_under_its_own_name_behind_the_catalog(): void
    {
        $period = $this->period();
        $sss = $this->deductionType('SSS', true, 1);

        $this->payslip($period, 'one@report.test', 10000, [
            ['type' => $sss, 'amount' => 500, 'employer' => 1000],
            ['type' => null, 'name' => 'Lost ID', 'amount' => 150],
        ]);
        $this->payslip($period, 'two@report.test', 8000, [
            ['type' => null, 'name' => 'lost id', 'amount' => 150],
        ]);

        $lines = $this->api()->getJson("/api/payroll-periods/{$period->id}/report")
            ->assertOk()
            ->json('data.deductions');

        $this->assertSame(['SSS', 'Lost ID'], array_column($lines, 'name'));
        // Same charge typed with different casing is one line, not two.
        $this->assertSame(2, $lines[1]['employee_count']);
        $this->assertSame(300.0, (float) $lines[1]['employee_amount']);
    }

    public function test_a_period_from_another_institution_is_not_reportable(): void
    {
        $other = Institution::factory()->create();
        $period = PayrollPeriod::create([
            'institution_id' => $other->id,
            'name' => 'July 2026',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-31',
            'status' => 'draft',
        ]);

        $this->api()->getJson("/api/payroll-periods/{$period->id}/report")->assertNotFound();
    }

    public function test_payroll_totals_are_closed_to_staff_without_the_module(): void
    {
        $period = $this->period();
        $teacherRole = Role::factory()->create(['title' => 'Teacher', 'slug' => 'teacher']);
        $teacher = User::factory()->create([
            'email' => 'teacher@report.test',
            'token' => 'teacher-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $teacher->id,
            'institution_id' => $this->institution->id,
            'role_id' => $teacherRole->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->getJson("/api/payroll-periods/{$period->id}/report")
            ->assertForbidden();
    }
}
