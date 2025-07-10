<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Role;
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

        // Create user with Super Administrator role
        User::factory(1)->create([
            'role_id' => $superAdminRole->id,
        ]);
    }
}
