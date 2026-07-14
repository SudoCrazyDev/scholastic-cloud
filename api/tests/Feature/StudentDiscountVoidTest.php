<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentDiscount;
use App\Models\StudentInstitution;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StudentDiscountVoidTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;
    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();

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
    }

    private function makeUserWithRole(string $roleSlug, string $token): User
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], ['title' => ucfirst($roleSlug)]);
        $user = User::factory()->create([
            'token' => $token,
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    private function makeDiscount(float $value = 1000): StudentDiscount
    {
        return StudentDiscount::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => '2026-2027',
            'discount_type' => 'fixed',
            'value' => $value,
        ]);
    }

    public function test_finance_user_can_void_a_discount(): void
    {
        $user = $this->makeUserWithRole('finance', 'finance-token');
        $discount = $this->makeDiscount();

        $response = $this->withHeader('Authorization', 'Bearer finance-token')
            ->postJson("/api/student-discounts/{$discount->id}/void", [
                'void_note' => 'Applied in error',
            ]);

        $response->assertOk();

        $discount->refresh();
        $this->assertNotNull($discount->voided_at);
        $this->assertSame($user->id, $discount->voided_by);
        $this->assertSame('Applied in error', $discount->void_note);
    }

    public function test_void_requires_a_note(): void
    {
        $this->makeUserWithRole('finance', 'finance-token');
        $discount = $this->makeDiscount();

        $response = $this->withHeader('Authorization', 'Bearer finance-token')
            ->postJson("/api/student-discounts/{$discount->id}/void", []);

        $response->assertStatus(422);
        $this->assertNull($discount->fresh()->voided_at);
    }

    public function test_already_voided_discount_cannot_be_voided_again(): void
    {
        $user = $this->makeUserWithRole('finance', 'finance-token');
        $discount = $this->makeDiscount();
        $discount->update([
            'voided_at' => now(),
            'voided_by' => $user->id,
            'void_note' => 'First void',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer finance-token')
            ->postJson("/api/student-discounts/{$discount->id}/void", [
                'void_note' => 'Second void',
            ]);

        $response->assertStatus(422);
        $this->assertSame('First void', $discount->fresh()->void_note);
    }

    public function test_unprivileged_role_cannot_void(): void
    {
        $this->makeUserWithRole('teacher', 'teacher-token');
        $discount = $this->makeDiscount();

        $response = $this->withHeader('Authorization', 'Bearer teacher-token')
            ->postJson("/api/student-discounts/{$discount->id}/void", [
                'void_note' => 'Trying anyway',
            ]);

        $response->assertStatus(403);
        $this->assertNull($discount->fresh()->voided_at);
    }

    public function test_voided_discount_excluded_from_ledger_totals_but_still_listed(): void
    {
        $user = $this->makeUserWithRole('finance', 'finance-token');
        $active = $this->makeDiscount(1000);
        $voided = $this->makeDiscount(500);
        $voided->update([
            'voided_at' => now(),
            'voided_by' => $user->id,
            'void_note' => 'Wrong amount',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer finance-token')
            ->getJson("/api/students/{$this->student->id}/ledger?academic_year=2026-2027");

        $response->assertOk();
        $data = $response->json('data');

        $this->assertEquals(1000.0, (float) $data['totals']['discounts']);

        $entries = collect($data['entries'])->where('type', 'discount');
        $this->assertCount(2, $entries);

        $voidedEntry = $entries->firstWhere('discount_id', $voided->id);
        $this->assertTrue($voidedEntry['voided']);
        $this->assertSame('Wrong amount', $voidedEntry['void_note']);
        $this->assertSame('student', $voidedEntry['discount_scope']);

        $activeEntry = $entries->firstWhere('discount_id', $active->id);
        $this->assertFalse($activeEntry['voided']);
    }
}
