<?php

namespace Tests\Feature;

use App\Models\Disbursement;
use App\Models\DisbursementComponentType;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Component types say how a disbursement was paid out. What matters here is the
 * default: every institution has one, a disbursement recorded without a choice
 * lands on it, and it cannot be deleted out from under the form.
 */
class DisbursementComponentTypeTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $this->makeUser('disb-token', ['disbursements.view', 'disbursements.manage']);
    }

    private function makeUser(string $token, array $permissions): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'finance', 'institution_id' => $this->institution->id],
            ['title' => 'Finance'],
        );

        foreach ($permissions as $permission) {
            \DB::table('role_permissions')->insertOrIgnore([
                'role_id' => $role->id,
                'permission' => $permission,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

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

    private function auth(): self
    {
        return $this->withHeader('Authorization', 'Bearer disb-token');
    }

    public function test_listing_gives_an_institution_a_cash_dispense_default(): void
    {
        // The institution was created after the seeding migration ran, so the
        // listing endpoint is what has to fill the gap.
        $response = $this->auth()->getJson('/api/disbursement-component-types');

        $response->assertOk();
        $data = $response->json('data');

        $this->assertCount(1, $data);
        $this->assertSame('Cash Dispense', $data[0]['name']);
        $this->assertTrue($data[0]['is_default']);
    }

    public function test_a_disbursement_recorded_without_a_component_type_defaults_to_cash_dispense(): void
    {
        $response = $this->auth()->postJson('/api/disbursements', [
            'title' => 'Electric bill',
            'amount' => 1500,
            'date_issued' => '2026-08-01',
        ]);

        $response->assertCreated();
        $this->assertSame('Cash Dispense', $response->json('data.component_type_name'));

        $default = DisbursementComponentType::defaultFor($this->institution->id);
        $this->assertSame($default->id, $response->json('data.disbursement_component_type_id'));
    }

    public function test_an_added_component_type_can_be_chosen_and_is_reported_back(): void
    {
        $created = $this->auth()->postJson('/api/disbursement-component-types', ['name' => 'Check']);
        $created->assertCreated();
        $this->assertFalse($created->json('data.is_default'));

        $response = $this->auth()->postJson('/api/disbursements', [
            'title' => 'Repairs',
            'amount' => 800,
            'date_issued' => '2026-08-02',
            'disbursement_component_type_id' => $created->json('data.id'),
        ]);

        $response->assertCreated();
        $this->assertSame('Check', $response->json('data.component_type_name'));
    }

    public function test_a_component_type_from_another_institution_is_refused(): void
    {
        $other = Institution::factory()->create();
        $foreign = DisbursementComponentType::defaultFor($other->id);

        $this->auth()->postJson('/api/disbursements', [
            'title' => 'Supplies',
            'amount' => 100,
            'date_issued' => '2026-08-03',
            'disbursement_component_type_id' => $foreign->id,
        ])->assertStatus(422);
    }

    public function test_the_default_component_type_cannot_be_deleted_but_others_can(): void
    {
        $default = DisbursementComponentType::defaultFor($this->institution->id);

        $this->auth()->deleteJson("/api/disbursement-component-types/{$default->id}")
            ->assertStatus(422);
        $this->assertDatabaseHas('disbursement_component_types', ['id' => $default->id]);

        $added = $this->auth()->postJson('/api/disbursement-component-types', ['name' => 'Bank Transfer']);
        $this->auth()->deleteJson("/api/disbursement-component-types/{$added->json('data.id')}")
            ->assertOk();
        $this->assertDatabaseMissing('disbursement_component_types', ['id' => $added->json('data.id')]);
    }

    public function test_deleting_a_component_type_keeps_the_disbursement(): void
    {
        $added = $this->auth()->postJson('/api/disbursement-component-types', ['name' => 'Petty Cash']);
        $typeId = $added->json('data.id');

        $disbursement = $this->auth()->postJson('/api/disbursements', [
            'title' => 'Snacks',
            'amount' => 250,
            'date_issued' => '2026-08-04',
            'disbursement_component_type_id' => $typeId,
        ]);
        $disbursementId = $disbursement->json('data.id');

        $this->auth()->deleteJson("/api/disbursement-component-types/{$typeId}")->assertOk();

        $this->assertNull(Disbursement::find($disbursementId)->disbursement_component_type_id);
        $this->assertSame('250.00', Disbursement::find($disbursementId)->amount);
    }

    public function test_renaming_the_default_keeps_it_as_the_default(): void
    {
        $default = DisbursementComponentType::defaultFor($this->institution->id);

        $this->auth()->putJson("/api/disbursement-component-types/{$default->id}", ['name' => 'Cash on Hand'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Cash on Hand')
            ->assertJsonPath('data.is_default', true);

        $this->assertSame($default->id, DisbursementComponentType::defaultFor($this->institution->id)->id);
    }

    public function test_component_type_names_are_unique_per_institution(): void
    {
        $this->auth()->postJson('/api/disbursement-component-types', ['name' => 'Check'])->assertCreated();
        $this->auth()->postJson('/api/disbursement-component-types', ['name' => 'Check'])->assertStatus(422);
    }
}
