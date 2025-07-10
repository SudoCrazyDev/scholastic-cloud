<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $roles = [
            'Super Administrator',
            'Institution Administrator',
            'Principal',
            'Subject Teacher',
            'HR Admin',
            'HR',
            'Staff',
        ];

        foreach ($roles as $roleTitle) {
            Role::create([
                'title' => $roleTitle,
                'slug' => Role::generateSlug($roleTitle),
            ]);
        }
    }
}
