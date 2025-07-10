<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Role;
use App\Models\Institution;
use App\Models\UserInstitution;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get the Super Administrator role
        $superAdminRole = Role::where('title', 'Super Administrator')->first();
        
        if (!$superAdminRole) {
            throw new \Exception('Super Administrator role not found. Please run RoleSeeder first.');
        }

        // Get or create a default institution
        $institution = Institution::first();
        if (!$institution) {
            $institution = Institution::factory()->create();
        }

        // Create user
        $user = User::factory()->create();

        // Create user-institution relationship with Super Administrator role
        UserInstitution::create([
            'user_id' => $user->id,
            'institution_id' => $institution->id,
            'role_id' => $superAdminRole->id,
            'is_default' => true,
            'is_main' => true,
        ]);
    }
}
