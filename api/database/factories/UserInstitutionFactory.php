<?php

namespace Database\Factories;

use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\UserInstitution>
 */
class UserInstitutionFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'institution_id' => Institution::factory(),
            // A real built-in role rather than Role::factory(), whose random
            // job-title slug would produce a role holding no module
            // permissions — which is not what a person attached to an
            // institution looks like in practice.
            'role_id' => fn () => self::defaultRole()->id,
            'is_default' => fake()->boolean(80), // 80% chance of being default
            'is_main' => fake()->boolean(20), // 20% chance of being main
        ];
    }

    /**
     * The institution-wide administrator role, created once and shared.
     */
    public static function defaultRole(): Role
    {
        return Role::firstOrCreate(
            ['slug' => 'institution-administrator', 'institution_id' => null],
            ['title' => 'Institution Administrator', 'is_system' => true],
        );
    }

    /**
     * Attach the user to the institution under a specific built-in role.
     */
    public function role(string $slug, ?string $title = null): static
    {
        return $this->state(fn (array $attributes) => [
            'role_id' => Role::firstOrCreate(
                ['slug' => $slug, 'institution_id' => null],
                ['title' => $title ?? Str::headline($slug), 'is_system' => true],
            )->id,
        ]);
    }

    /**
     * Indicate that this is the default institution for the user.
     */
    public function default(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_default' => true,
        ]);
    }

    /**
     * Indicate that this is the main institution for the user.
     */
    public function main(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_main' => true,
        ]);
    }
}
