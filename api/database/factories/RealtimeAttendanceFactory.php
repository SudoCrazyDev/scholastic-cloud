<?php

namespace Database\Factories;

use App\Models\RealtimeAttendance;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\RealtimeAttendance>
 */
class RealtimeAttendanceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $authDateTime = fake()->dateTimeBetween('today 06:00:00', 'today 18:00:00');
        $authDate = $authDateTime->format('Y-m-d');
        $authTime = $authDateTime->format('H:i:s');

        return [
            'id' => fake()->uuid(),
            'auth_date_time' => $authDateTime->format('Y-m-d H:i:s'),
            'auth_date' => $authDate,
            'auth_time' => $authTime,
            'direction' => fake()->randomElement(['in', 'out']),
            'device_name' => 'GSCNSSAT',
            'device_serial_no' => fake()->regexify('[A-Z0-9]{10}'),
            'person_name' => fake()->name(),
            'card_no' => fake()->regexify('[0-9]{8}'),
        ];
    }

    /**
     * Set a specific auth_date for all records
     */
    public function withAuthDate(string $authDate): static
    {
        return $this->state(function (array $attributes) use ($authDate) {
            $authDateTime = fake()->dateTimeBetween($authDate . ' 06:00:00', $authDate . ' 18:00:00');
            
            return [
                'auth_date' => $authDate,
                'auth_date_time' => $authDateTime->format('Y-m-d H:i:s'),
                'auth_time' => $authDateTime->format('H:i:s'),
            ];
        });
    }

    /**
     * Set a specific person_name
     */
    public function withPersonName(string $personName): static
    {
        return $this->state(fn (array $attributes) => [
            'person_name' => $personName,
        ]);
    }

    /**
     * Set a specific direction
     */
    public function withDirection(string $direction): static
    {
        return $this->state(fn (array $attributes) => [
            'direction' => $direction,
        ]);
    }
} 