<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollCompensationDeduction;
use App\Models\PayrollDeductionBracket;
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
 * A deduction type can be a table of salary ranges rather than one figure.
 *
 * This is the shape the contribution schedules are actually published in: the
 * salary picks a bracket, and the bracket names what the employee remits and
 * what the employer matches — two different figures that no single rate or
 * amount can express.
 */
class BracketDeductionTypeTest extends TestCase
{
    use RefreshDatabase;

    /** 1–15 July 2026 holds 11 weekdays; nobody here has a staff schedule. */
    private const WORKING_DAYS = 11;

    private Institution $institution;

    /** ₱1,000/day → ₱11,000 of basic pay for the period. */
    private PayrollCompensation $teacher;

    /** ₱2,000/day → ₱22,000, so the two land in different ranges. */
    private PayrollCompensation $principal;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

        $admin = User::factory()->create([
            'email' => 'admin@bracket.test',
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

        $this->teacher = $this->compensationFor('Teacher', 1000);
        $this->principal = $this->compensationFor('Principal', 2000);
    }

    private function compensationFor(string $designation, float $dailyRate): PayrollCompensation
    {
        $staff = User::factory()->create(['email' => strtolower($designation).'@bracket.test']);
        UserInstitution::factory()->create([
            'user_id' => $staff->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
        ]);

        return PayrollCompensation::create([
            'institution_id' => $this->institution->id,
            'user_id' => $staff->id,
            'designation' => $designation,
            'daily_rate' => $dailyRate,
            'hours_per_day' => 8,
        ]);
    }

    /**
     * The SSS-shaped table this suite works against: three peso ranges, the
     * last one open-ended, with the employer paying twice the employee.
     */
    private function sssTable(array $typeOverrides = [], ?array $ranges = null): PayrollDeductionType
    {
        $type = PayrollDeductionType::create(array_merge([
            'institution_id' => $this->institution->id,
            'name' => 'SSS',
            'calculation_type' => PayrollDeductionType::CALC_BRACKET,
            'has_employer_share' => true,
            'percent_basis' => PayrollDeductionType::BASIS_BASIC_PAY,
            'is_active' => true,
        ], $typeOverrides));

        $ranges ??= [
            ['min_salary' => 0, 'max_salary' => 10000, 'employee_amount' => 400, 'employer_amount' => 800],
            ['min_salary' => 10000.01, 'max_salary' => 20000, 'employee_amount' => 550, 'employer_amount' => 1100],
            ['min_salary' => 20000.01, 'max_salary' => null, 'employee_amount' => 900, 'employer_amount' => 1800],
        ];

        foreach ($ranges as $index => $range) {
            $type->brackets()->create($range + ['sort_order' => $index]);
        }

        return $type->load('brackets');
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

    public function test_each_salary_picks_its_own_range(): void
    {
        $this->sssTable();
        $period = $this->generate();

        $teacherLine = $this->payslipFor($period, $this->teacher)->deductions()->firstOrFail();
        $principalLine = $this->payslipFor($period, $this->principal)->deductions()->firstOrFail();

        // ₱11,000 of basic pay sits in the middle range, ₱22,000 in the top one.
        $this->assertSame(550.0, (float) $teacherLine->amount);
        $this->assertSame(1100.0, (float) $teacherLine->employer_amount);
        $this->assertSame(10000.01, (float) $teacherLine->bracket_min);
        $this->assertSame(20000.0, (float) $teacherLine->bracket_max);
        $this->assertSame(11000.0, (float) $teacherLine->basis_amount);

        $this->assertSame(900.0, (float) $principalLine->amount);
        $this->assertSame(1800.0, (float) $principalLine->employer_amount);
        // The open-ended top range has no ceiling to record.
        $this->assertNull($principalLine->bracket_max);
    }

    public function test_a_range_can_charge_a_percentage_instead_of_a_peso_figure(): void
    {
        $this->sssTable(['name' => 'PhilHealth'], [
            [
                'min_salary' => 0,
                'max_salary' => 20000,
                'amount_type' => PayrollDeductionBracket::AMOUNT_PERCENTAGE,
                'employee_rate_percent' => 3,
                'employer_rate_percent' => 6,
            ],
            ['min_salary' => 20000.01, 'max_salary' => null, 'employee_amount' => 750, 'employer_amount' => 1500],
        ]);

        $period = $this->generate();
        $line = $this->payslipFor($period, $this->teacher)->deductions()->firstOrFail();

        // 3% and 6% of the ₱11,000 that matched the range.
        $this->assertSame(330.0, (float) $line->amount);
        $this->assertSame(660.0, (float) $line->employer_amount);
        $this->assertSame(3.0, (float) $line->rate_percent);
        $this->assertSame(11000.0, (float) $line->basis_amount);

        // The employee two ranges up is on the peso range in the same table.
        $principalLine = $this->payslipFor($period, $this->principal)->deductions()->firstOrFail();
        $this->assertSame(750.0, (float) $principalLine->amount);
        $this->assertSame(0.0, (float) $principalLine->rate_percent);
    }

    public function test_a_salary_under_the_first_range_still_contributes_at_it(): void
    {
        // A table that starts at ₱15,000 — the teacher's ₱11,000 is below it.
        $this->sssTable([], [
            ['min_salary' => 15000, 'max_salary' => 25000, 'employee_amount' => 500, 'employer_amount' => 1000],
            ['min_salary' => 25000.01, 'max_salary' => null, 'employee_amount' => 900, 'employer_amount' => 1800],
        ]);

        $line = $this->payslipFor($this->generate(), $this->teacher)->deductions()->firstOrFail();

        $this->assertSame(500.0, (float) $line->amount);
        $this->assertSame(15000.0, (float) $line->bracket_min);
    }

    public function test_a_salary_past_the_last_ceiling_contributes_at_the_last_range(): void
    {
        // Every range is closed, and the principal's ₱22,000 is over the top of
        // them all: the schedule's last row is what applies.
        $this->sssTable([], [
            ['min_salary' => 0, 'max_salary' => 10000, 'employee_amount' => 400, 'employer_amount' => 800],
            ['min_salary' => 10000.01, 'max_salary' => 20000, 'employee_amount' => 550, 'employer_amount' => 1100],
        ]);

        $line = $this->payslipFor($this->generate(), $this->principal)->deductions()->firstOrFail();

        $this->assertSame(550.0, (float) $line->amount);
        $this->assertSame(10000.01, (float) $line->bracket_min);
    }

    public function test_the_basis_ignores_lates_and_absences_like_a_percentage_type_does(): void
    {
        $this->sssTable();
        $payslip = $this->payslipFor($this->generate(), $this->teacher);

        // Nobody punched in, so nothing was earned — and the contribution is
        // charged on the salary anyway.
        $this->assertSame(0.0, (float) $payslip->gross_pay);
        $this->assertSame(1000.0 * self::WORKING_DAYS, (float) $payslip->basic_pay);
        $this->assertSame(550.0, (float) $payslip->total_deductions);
    }

    public function test_a_table_matched_on_salary_earned_follows_what_was_paid_out(): void
    {
        $this->sssTable(['percent_basis' => PayrollDeductionType::BASIS_GROSS_PAY]);

        $payslip = $this->payslipFor($this->generate(), $this->teacher);

        // Nothing earned yet: ₱0 lands in the bottom range.
        $this->assertSame(400.0, (float) $payslip->deductions()->firstOrFail()->amount);

        $days = $payslip->days()->where('is_rest_day', false)->take(6)->get();
        foreach ($days as $day) {
            $day->update(['amount_earned' => 2500, 'hours_worked' => 8]);
        }

        app(PayrollService::class)->recomputeTotals($payslip->fresh());
        $line = $payslip->fresh()->deductions()->firstOrFail();

        // ₱15,000 earned moves them up a range.
        $this->assertSame(15000.0, (float) $line->basis_amount);
        $this->assertSame(550.0, (float) $line->amount);
    }

    public function test_an_edited_daily_rate_moves_the_payslip_into_another_range(): void
    {
        $this->sssTable();
        $payslip = $this->payslipFor($this->generate(), $this->teacher);

        $this->assertSame(550.0, (float) $payslip->deductions()->firstOrFail()->amount);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payslips/{$payslip->id}", ['daily_rate' => 200])
            ->assertOk();

        $line = $payslip->fresh()->deductions()->firstOrFail();

        // ₱2,200 of basic pay drops them into the bottom range.
        $this->assertSame(2200.0, (float) $line->basis_amount);
        $this->assertSame(400.0, (float) $line->amount);
        $this->assertSame(0.0, (float) $line->bracket_min);
        $this->assertSame(10000.0, (float) $line->bracket_max);
    }

    public function test_an_exempt_employee_gets_no_line_at_all(): void
    {
        $type = $this->sssTable();

        PayrollCompensationDeduction::create([
            'payroll_compensation_id' => $this->principal->id,
            'deduction_type_id' => $type->id,
            'is_exempt' => true,
        ]);

        $period = $this->generate();

        $this->assertSame(550.0, (float) $this->payslipFor($period, $this->teacher)->total_deductions);
        $this->assertSame(0, $this->payslipFor($period, $this->principal)->deductions()->count());
    }

    public function test_a_type_with_no_ranges_deducts_nothing(): void
    {
        PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => 'Unfinished',
            'calculation_type' => PayrollDeductionType::CALC_BRACKET,
            'is_active' => true,
        ]);

        // A ₱0 line on every payslip in the school would be worse than none.
        $this->assertSame(0, $this->payslipFor($this->generate(), $this->teacher)->deductions()->count());
    }

    public function test_the_api_stores_the_ranges_in_salary_order(): void
    {
        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payroll-deduction-types', [
                'name' => 'SSS',
                'calculation_type' => 'bracket',
                'has_employer_share' => true,
                'percent_basis' => 'basic_pay',
                'brackets' => [
                    // Deliberately out of order.
                    ['min_salary' => 20000.01, 'max_salary' => null, 'employee_amount' => 900, 'employer_amount' => 1800],
                    ['min_salary' => 0, 'max_salary' => 20000, 'employee_amount' => 550, 'employer_amount' => 1100],
                ],
            ])
            ->assertCreated()
            ->json('data');

        $this->assertSame('bracket', $response['calculation_type']);
        $this->assertSame([0.0, 20000.01], array_map('floatval', array_column($response['brackets'], 'min_salary')));
        $this->assertSame(550.0, (float) $response['brackets'][0]['employee_amount']);

        // Nothing is handed out per employee — the table already covers them,
        // and each employee's own salary is what differs.
        $this->assertSame(0, PayrollCompensationDeduction::where('deduction_type_id', $response['id'])->count());
    }

    public function test_overlapping_ranges_are_refused(): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payroll-deduction-types', [
                'name' => 'SSS',
                'calculation_type' => 'bracket',
                'brackets' => [
                    ['min_salary' => 0, 'max_salary' => 15000, 'employee_amount' => 400],
                    ['min_salary' => 10000, 'max_salary' => 20000, 'employee_amount' => 550],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('brackets');

        $this->assertSame(0, PayrollDeductionType::count());
    }

    public function test_only_the_last_range_may_be_open_ended(): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payroll-deduction-types', [
                'name' => 'SSS',
                'calculation_type' => 'bracket',
                'brackets' => [
                    ['min_salary' => 0, 'max_salary' => null, 'employee_amount' => 400],
                    ['min_salary' => 20000, 'max_salary' => null, 'employee_amount' => 550],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('brackets');
    }

    public function test_a_bracket_type_needs_a_table(): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payroll-deduction-types', [
                'name' => 'SSS',
                'calculation_type' => 'bracket',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('brackets');
    }

    public function test_switching_a_type_away_from_bracket_drops_its_table(): void
    {
        $type = $this->sssTable();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payroll-deduction-types/{$type->id}", [
                'name' => 'SSS',
                'calculation_type' => 'fixed',
                'default_amount' => 500,
            ])
            ->assertOk();

        // A schedule left sitting behind a flat ₱500 would come straight back
        // the moment somebody switched the type again.
        $this->assertSame(0, PayrollDeductionBracket::where('deduction_type_id', $type->id)->count());
        $this->assertSame(500.0, (float) $type->fresh()->default_amount);
        $this->assertSame(500.0, (float) $this->payslipFor($this->generate(), $this->teacher)->total_deductions);
    }

    public function test_switching_a_type_to_bracket_clears_its_flat_default(): void
    {
        $typeId = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payroll-deduction-types', ['name' => 'SSS', 'default_amount' => 500])
            ->assertCreated()
            ->json('data.id');

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payroll-deduction-types/{$typeId}", [
                'name' => 'SSS',
                'calculation_type' => 'bracket',
                'percent_basis' => 'basic_pay',
                'brackets' => [
                    ['min_salary' => 0, 'max_salary' => null, 'employee_amount' => 600],
                ],
            ])
            ->assertOk();

        $this->assertSame(0.0, (float) PayrollDeductionType::findOrFail($typeId)->default_amount);
        // A leftover ₱500 on the staff row must not be charged on top of the
        // ₱600 the table now says.
        $this->assertSame(600.0, (float) $this->payslipFor($this->generate(), $this->teacher)->total_deductions);
    }

    public function test_the_rates_editor_round_trips_an_exemption(): void
    {
        $type = $this->sssTable();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payroll-compensations/{$this->teacher->user_id}", [
                'daily_rate' => 1000,
                'hours_per_day' => 8,
                'deductions' => [
                    ['deduction_type_id' => $type->id, 'amount' => 0, 'is_exempt' => true],
                ],
            ])
            ->assertOk();

        $rows = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/payroll-compensations')
            ->assertOk()
            ->json('data');

        $compensation = collect($rows)->firstWhere('user_id', $this->teacher->user_id)['compensation'];

        // Absent from the deductions preview — nothing is deducted — but the
        // exemption itself has to survive, or saving the form again would
        // quietly put them back on the table.
        $this->assertSame([], array_column($compensation['deductions'], 'deduction_type_id'));
        $this->assertSame([$type->id], $compensation['exempt_deduction_type_ids']);
    }

    public function test_the_rates_editor_shows_a_bracket_type_without_a_figure(): void
    {
        $this->sssTable();

        $rows = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/payroll-compensations')
            ->assertOk()
            ->json('data');

        $line = collect($rows)->firstWhere('user_id', $this->teacher->user_id)['compensation']['deductions'][0];

        $this->assertSame('bracket', $line['calculation_type']);
        $this->assertSame('basic_pay', $line['percent_basis']);
        // No payroll period here, so no salary to look up in the table.
        $this->assertSame(0.0, (float) $line['amount']);
    }

    public function test_a_bracket_line_kept_on_a_payslip_is_repriced_not_overwritten(): void
    {
        $this->sssTable();
        $payslip = $this->payslipFor($this->generate(), $this->teacher);
        $line = $payslip->deductions()->firstOrFail();

        // The editor saves bracket rows with no figure of their own; the table
        // is what fills them back in.
        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payslips/{$payslip->id}", [
                'deductions' => [[
                    'deduction_type_id' => $line->deduction_type_id,
                    'name' => 'SSS',
                    'calculation_type' => 'bracket',
                    'amount' => 0,
                    'percent_basis' => 'basic_pay',
                ]],
            ])
            ->assertOk()
            ->json('data');

        $this->assertSame(550.0, (float) $response['deductions'][0]['amount']);
        $this->assertSame(1100.0, (float) $response['deductions'][0]['employer_amount']);
        $this->assertSame(10000.01, (float) $response['deductions'][0]['bracket_min']);
        $this->assertSame(550.0, (float) $response['total_deductions']);
    }

    public function test_a_bracket_line_removed_from_a_payslip_stays_removed(): void
    {
        $this->sssTable();
        $payslip = $this->payslipFor($this->generate(), $this->teacher);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payslips/{$payslip->id}", ['deductions' => []])
            ->assertOk();

        $this->assertSame(0, $payslip->fresh()->deductions()->count());
        $this->assertSame(0.0, (float) $payslip->fresh()->total_deductions);
    }

    public function test_a_deleted_type_leaves_its_payslip_line_alone(): void
    {
        $type = $this->sssTable();
        $payslip = $this->payslipFor($this->generate(), $this->teacher);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->deleteJson("/api/payroll-deduction-types/{$type->id}")
            ->assertOk();

        app(PayrollService::class)->recomputeTotals($payslip->fresh());
        $line = $payslip->fresh()->deductions()->firstOrFail();

        // There is no table left to re-match against, so the figures the
        // payslip was generated with are all there is to go on.
        $this->assertNull($line->deduction_type_id);
        $this->assertSame(550.0, (float) $line->amount);
        $this->assertSame(550.0, (float) $payslip->fresh()->total_deductions);
    }
}
