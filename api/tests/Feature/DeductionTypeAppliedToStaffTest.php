<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollCompensationDeduction;
use App\Models\PayrollDeductionType;
use App\Models\PayrollPeriod;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\PayrollService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A deduction type saved with a default amount lands on every employee's rates
 * on its own, so payroll never has to be typed in one employee at a time.
 */
class DeductionTypeAppliedToStaffTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private PayrollCompensation $teacher;

    private PayrollCompensation $aide;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

        $admin = User::factory()->create([
            'email' => 'principal@payroll.test',
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
        // The shared user factory hardcodes one email, so each staff member
        // needs its own.
        $staff = User::factory()->create(['email' => strtolower($designation).'@payroll.test']);
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

    private function createType(array $payload): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payroll-deduction-types', $payload)
            ->assertCreated()
            ->json();
    }

    private function amountsFor(string $typeId, PayrollCompensation $compensation): ?array
    {
        $row = PayrollCompensationDeduction::where('deduction_type_id', $typeId)
            ->where('payroll_compensation_id', $compensation->id)
            ->first();

        return $row ? [(float) $row->amount, (float) $row->employer_amount] : null;
    }

    public function test_new_type_with_a_default_reaches_every_employee(): void
    {
        $response = $this->createType([
            'name' => 'SSS',
            'default_amount' => 1025,
            'has_employer_share' => true,
            'default_employer_amount' => 2080,
        ]);

        $typeId = $response['data']['id'];

        $this->assertSame([1025.0, 2080.0], $this->amountsFor($typeId, $this->teacher));
        $this->assertSame([1025.0, 2080.0], $this->amountsFor($typeId, $this->aide));
        $this->assertStringContainsString('applied to 2 employees', $response['message']);
    }

    public function test_type_without_a_default_is_not_pushed_to_anyone(): void
    {
        $response = $this->createType(['name' => 'Cash Advance']);

        $this->assertNull($this->amountsFor($response['data']['id'], $this->teacher));
        $this->assertStringNotContainsString('applied to', $response['message']);
    }

    public function test_employer_share_is_withheld_when_the_type_is_not_shared(): void
    {
        $response = $this->createType([
            'name' => 'Union Dues',
            'default_amount' => 50,
            'has_employer_share' => false,
            'default_employer_amount' => 999,
        ]);

        $this->assertSame([50.0, 0.0], $this->amountsFor($response['data']['id'], $this->teacher));
    }

    public function test_inactive_type_is_not_pushed_to_anyone(): void
    {
        $response = $this->createType([
            'name' => 'Retired Levy',
            'default_amount' => 100,
            'is_active' => false,
        ]);

        $this->assertNull($this->amountsFor($response['data']['id'], $this->teacher));
    }

    public function test_edit_fills_the_gaps_but_keeps_per_employee_amounts(): void
    {
        $typeId = $this->createType(['name' => 'PhilHealth', 'default_amount' => 400])['data']['id'];

        // The aide negotiated a different amount; the teacher's row is removed
        // to stand in for staff hired after the type was created.
        PayrollCompensationDeduction::where('deduction_type_id', $typeId)
            ->where('payroll_compensation_id', $this->aide->id)
            ->update(['amount' => 275]);
        PayrollCompensationDeduction::where('deduction_type_id', $typeId)
            ->where('payroll_compensation_id', $this->teacher->id)
            ->delete();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payroll-deduction-types/{$typeId}", [
                'name' => 'PhilHealth',
                'default_amount' => 500,
            ])
            ->assertOk();

        $this->assertSame([500.0, 0.0], $this->amountsFor($typeId, $this->teacher));
        $this->assertSame([275.0, 0.0], $this->amountsFor($typeId, $this->aide));
    }

    public function test_apply_to_all_staff_overwrites_every_employee(): void
    {
        $typeId = $this->createType(['name' => 'PhilHealth', 'default_amount' => 400])['data']['id'];

        PayrollCompensationDeduction::where('deduction_type_id', $typeId)
            ->where('payroll_compensation_id', $this->aide->id)
            ->update(['amount' => 275]);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payroll-deduction-types/{$typeId}", [
                'name' => 'PhilHealth',
                'default_amount' => 500,
                'apply_to_all_staff' => true,
            ])
            ->assertOk();

        $this->assertSame([500.0, 0.0], $this->amountsFor($typeId, $this->teacher));
        $this->assertSame([500.0, 0.0], $this->amountsFor($typeId, $this->aide));
    }

    /**
     * The payslip deduction lines a generate would produce for one staff member.
     *
     * @return array<string, array{float, float}> keyed by deduction name
     */
    private function generatedLinesFor(PayrollCompensation $compensation): array
    {
        $types = PayrollDeductionType::where('institution_id', $this->institution->id)
            ->where('is_active', true)
            ->get();

        $lines = app(PayrollService::class)
            ->resolveDeductions($compensation->fresh('deductions.deductionType'), $types);

        return collect($lines)
            ->mapWithKeys(fn ($line) => [$line['name'] => [$line['amount'], $line['employer_amount']]])
            ->all();
    }

    public function test_generate_applies_a_type_default_to_staff_with_no_amount_of_their_own(): void
    {
        // The catalog entry exists before anyone is given an amount — the case
        // a backfill on save cannot reach.
        $type = PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => 'Uniform Fee',
            'default_amount' => 150,
            'is_active' => true,
        ]);

        $this->assertSame(
            ['Uniform Fee' => [150.0, 0.0]],
            $this->generatedLinesFor($this->teacher)
        );
        $this->assertSame(
            ['Uniform Fee' => [150.0, 0.0]],
            $this->generatedLinesFor($this->aide)
        );

        // A staff member's own amount still wins.
        PayrollCompensationDeduction::create([
            'payroll_compensation_id' => $this->aide->id,
            'deduction_type_id' => $type->id,
            'amount' => 75,
        ]);

        $this->assertSame(['Uniform Fee' => [75.0, 0.0]], $this->generatedLinesFor($this->aide));
    }

    public function test_a_zero_row_exempts_one_staff_member_from_a_defaulted_type(): void
    {
        $type = PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => 'Uniform Fee',
            'default_amount' => 150,
            'is_active' => true,
        ]);

        PayrollCompensationDeduction::create([
            'payroll_compensation_id' => $this->aide->id,
            'deduction_type_id' => $type->id,
            'amount' => 0,
            'employer_amount' => 0,
        ]);

        $this->assertSame(['Uniform Fee' => [150.0, 0.0]], $this->generatedLinesFor($this->teacher));
        $this->assertSame([], $this->generatedLinesFor($this->aide));
    }

    public function test_rates_editor_keeps_an_exemption_but_drops_a_meaningless_zero_row(): void
    {
        $defaulted = PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => 'Uniform Fee',
            'default_amount' => 150,
            'is_active' => true,
        ]);
        $undefaulted = PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => 'Cash Advance',
            'default_amount' => 0,
            'is_active' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payroll-compensations/{$this->aide->user_id}", [
                'daily_rate' => 1000,
                'hours_per_day' => 8,
                'deductions' => [
                    ['deduction_type_id' => $defaulted->id, 'amount' => 0],
                    ['deduction_type_id' => $undefaulted->id, 'amount' => 0],
                ],
            ])
            ->assertOk();

        // Zero against a defaulted type is an exemption worth storing; zero
        // against a type with no default is noise that would block a later one.
        $this->assertSame([0.0, 0.0], $this->amountsFor($defaulted->id, $this->aide));
        $this->assertNull($this->amountsFor($undefaulted->id, $this->aide));
    }

    public function test_inherited_defaults_show_on_the_rates_list(): void
    {
        PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => 'Uniform Fee',
            'default_amount' => 150,
            'is_active' => true,
        ]);

        $rows = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/payroll-compensations')
            ->assertOk()
            ->json('data');

        $teacher = collect($rows)->firstWhere('user_id', $this->teacher->user_id);

        $this->assertSame(150.0, (float) $teacher['compensation']['deductions_total']);
        $this->assertSame('Uniform Fee', $teacher['compensation']['deductions'][0]['name']);
        $this->assertTrue($teacher['compensation']['deductions'][0]['from_default']);
    }

    public function test_generate_writes_the_inherited_default_onto_the_payslip(): void
    {
        PayrollDeductionType::create([
            'institution_id' => $this->institution->id,
            'name' => 'Uniform Fee',
            'default_amount' => 150,
            'is_active' => true,
        ]);

        $period = PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026 1st half',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-15',
            'status' => 'draft',
        ]);

        app(PayrollService::class)->generateForPeriod($period);

        $payslip = $period->payslips()->where('user_id', $this->teacher->user_id)->firstOrFail();

        $this->assertSame('Uniform Fee', $payslip->deductions()->firstOrFail()->name);
        $this->assertSame(150.0, (float) $payslip->deductions()->firstOrFail()->amount);
        $this->assertSame(150.0, (float) $payslip->total_deductions);
    }

    public function test_staff_of_another_institution_are_untouched(): void
    {
        $otherInstitution = Institution::factory()->create();
        $outsider = User::factory()->create(['email' => 'outsider@payroll.test']);
        $outsiderCompensation = PayrollCompensation::create([
            'institution_id' => $otherInstitution->id,
            'user_id' => $outsider->id,
            'daily_rate' => 900,
            'hours_per_day' => 8,
        ]);

        $typeId = $this->createType(['name' => 'SSS', 'default_amount' => 1025])['data']['id'];

        $this->assertNull($this->amountsFor($typeId, $outsiderCompensation));
    }
}
