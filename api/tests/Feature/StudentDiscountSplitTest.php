<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\SchoolFee;
use App\Models\Student;
use App\Models\StudentDiscount;
use App\Models\StudentInstitution;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StudentDiscountSplitTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Institution $institution;
    private Student $student;
    private SchoolFee $tuitionFee;
    private SchoolFee $miscFee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $this->user = User::factory()->create([
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->student = Student::create([
            'first_name' => 'Test',
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $this->student->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
            'academic_year' => '2026-2027',
        ]);

        $this->tuitionFee = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Tuition Fee',
            'is_active' => true,
        ]);
        $this->miscFee = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Miscellaneous Fee',
            'is_active' => true,
        ]);
    }

    private function postDiscount(array $payload)
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-discounts', array_merge([
                'student_id' => $this->student->id,
                'academic_year' => '2026-2027',
                'discount_type' => 'fixed',
                'value' => 11000,
            ], $payload));
    }

    public function test_split_allocations_create_one_discount_per_row(): void
    {
        $response = $this->postDiscount([
            'description' => 'ESC_Gensan',
            'allocations' => [
                ['school_fee_id' => $this->tuitionFee->id, 'value' => 6000],
                ['school_fee_id' => $this->miscFee->id, 'value' => 3000],
                ['school_fee_id' => null, 'value' => 2000],
            ],
        ]);

        $response->assertCreated()->assertJsonCount(3, 'data');

        $discounts = StudentDiscount::orderBy('value', 'desc')->get();
        $this->assertCount(3, $discounts);
        $this->assertEquals([6000.0, 3000.0, 2000.0], $discounts->pluck('value')->map(fn ($v) => (float) $v)->all());
        $this->assertSame($this->tuitionFee->id, $discounts[0]->school_fee_id);
        $this->assertSame($this->miscFee->id, $discounts[1]->school_fee_id);
        $this->assertNull($discounts[2]->school_fee_id);
        $this->assertSame('ESC_Gensan', $discounts[0]->description);
    }

    public function test_allocations_must_add_up_to_total(): void
    {
        $response = $this->postDiscount([
            'allocations' => [
                ['school_fee_id' => $this->tuitionFee->id, 'value' => 6000],
                ['school_fee_id' => $this->miscFee->id, 'value' => 4000],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, StudentDiscount::count());
    }

    public function test_allocations_rejected_for_percentage_discounts(): void
    {
        $response = $this->postDiscount([
            'discount_type' => 'percentage',
            'value' => 50,
            'allocations' => [
                ['school_fee_id' => $this->tuitionFee->id, 'value' => 25],
                ['school_fee_id' => $this->miscFee->id, 'value' => 25],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, StudentDiscount::count());
    }

    public function test_allocation_fee_must_belong_to_institution(): void
    {
        $otherInstitution = Institution::factory()->create();
        $foreignFee = SchoolFee::create([
            'institution_id' => $otherInstitution->id,
            'name' => 'Foreign Fee',
            'is_active' => true,
        ]);

        $response = $this->postDiscount([
            'allocations' => [
                ['school_fee_id' => $foreignFee->id, 'value' => 6000],
                ['school_fee_id' => $this->tuitionFee->id, 'value' => 5000],
            ],
        ]);

        $response->assertStatus(404);
        $this->assertSame(0, StudentDiscount::count());
    }

    public function test_single_discount_without_allocations_still_works(): void
    {
        $response = $this->postDiscount([
            'school_fee_id' => $this->tuitionFee->id,
        ]);

        $response->assertCreated();
        $this->assertSame(1, StudentDiscount::count());
        $discount = StudentDiscount::first();
        $this->assertSame($this->tuitionFee->id, $discount->school_fee_id);
        $this->assertEquals(11000.0, (float) $discount->value);
    }
}
