<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Fix users who don't have a default institution
        // For each user, if they don't have any institution with is_default = true,
        // set the first institution as default
        $usersWithoutDefault = DB::table('users')
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                      ->from('user_institutions')
                      ->whereRaw('user_institutions.user_id = users.id')
                      ->where('user_institutions.is_default', true);
            })
            ->get();

        foreach ($usersWithoutDefault as $user) {
            $firstInstitution = DB::table('user_institutions')
                ->where('user_id', $user->id)
                ->orderBy('created_at', 'asc')
                ->first();

            if ($firstInstitution) {
                DB::table('user_institutions')
                    ->where('id', $firstInstitution->id)
                    ->update(['is_default' => true]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // This migration is not reversible as it's fixing data integrity
        // We don't want to remove default institutions once they're set
    }
};
