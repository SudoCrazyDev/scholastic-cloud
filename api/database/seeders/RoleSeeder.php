<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class RoleSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * These are the platform's built-in roles: shared by every institution,
     * not editable from an institution's role builder, and given their
     * permissions by RolePermissionSeeder. An institution that wants something
     * different creates its own role instead.
     */
    public function run(): void
    {
        $roles = [
            'Super Administrator',
            'Institution Administrator',
            'Principal',
            'Assistant Principal',
            'Curriculum Head',
            'Department Head',
            'Subject Teacher',
            'Registrar',
            'Finance',
            'HR Admin',
            'HR',
            'Staff',
        ];

        foreach ($roles as $roleTitle) {
            // firstOrCreate on the slug so the seeder can be re-run on an
            // existing database without duplicating built-in roles.
            Role::firstOrCreate(
                [
                    'slug' => Str::slug($roleTitle),
                    'institution_id' => null,
                ],
                [
                    'title' => $roleTitle,
                    'is_system' => true,
                ]
            );
        }
    }
}
