<?php

namespace Database\Factories;

use App\Models\Topic;
use App\Models\Subject;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Topic>
 */
class TopicFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = Topic::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subject_id' => Subject::factory(),
            'title' => $this->faker->sentence(3, 6),
            'description' => $this->faker->optional(0.7)->paragraph(),
            'order' => $this->faker->numberBetween(1, 20),
            'is_completed' => $this->faker->boolean(30), // 30% chance of being completed
        ];
    }

    /**
     * Indicate that the topic is completed.
     */
    public function completed(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_completed' => true,
        ]);
    }

    /**
     * Indicate that the topic is not completed.
     */
    public function incomplete(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_completed' => false,
        ]);
    }
}
