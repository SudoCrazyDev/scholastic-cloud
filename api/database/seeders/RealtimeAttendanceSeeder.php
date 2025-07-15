<?php

namespace Database\Seeders;

use App\Models\RealtimeAttendance;
use Illuminate\Database\Seeder;
use Faker\Factory as Faker;

class RealtimeAttendanceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Clear existing attendance records
        // RealtimeAttendance::truncate();
        
        $faker = Faker::create();
        
        // Create attendance records for today
        $today = now()->toDateString();
        
        // Generate 8 random people names using Faker
        $people = [];
        for ($i = 0; $i < 30; $i++) {
            $people[] = $faker->name();
        }

        foreach ($people as $person) {
            // Create 2-4 attendance records per person for today
            $recordCount = rand(2, 4);
            
            RealtimeAttendance::factory()
                ->withAuthDate($today)
                ->withPersonName($person)
                ->count($recordCount)
                ->create();
        }

        // Create some attendance records for yesterday as well
        $yesterday = now()->subDay()->toDateString();
        
        foreach (array_slice($people, 0, 4) as $person) {
            RealtimeAttendance::factory()
                ->withAuthDate($yesterday)
                ->withPersonName($person)
                ->count(rand(2, 3))
                ->create();
        }

        $this->command->info('RealtimeAttendance data seeded successfully!');
        $this->command->info("Created attendance records for {$today} and {$yesterday}");
    }
} 