<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\Institution;
use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;

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
            'role_id' => Role::factory(),
            'is_default' => fake()->boolean(80), // 80% chance of being default
            'is_main' => fake()->boolean(20), // 20% chance of being main
        ];
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