<?php

namespace Database\Factories;

use App\Models\Institution;
use App\Models\Subscription;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Institution>
 */
class InstitutionFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'title' => fake()->company() . ' ' . fake()->randomElement(['University', 'College', 'School', 'Institute', 'Academy']),
            'abbr' => strtoupper(fake()->lexify('???')),
            'division' => fake()->optional()->city(),
            'region' => fake()->optional()->state(),
            'gov_id' => fake()->optional()->numerify('GOV-#####'),
            'logo' => fake()->optional()->imageUrl(200, 200, 'business'),
            'subscription_id' => Subscription::inRandomOrder()->first()?->id,
        ];
    }
}
