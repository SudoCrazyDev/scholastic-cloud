<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add 'query_users' so admins can pull the full enrolled roster from an
        // ADMS device on demand (DATA QUERY USERINFO). Raw ALTER because changing
        // an enum requires doctrine/dbal otherwise.
        DB::statement("ALTER TABLE device_commands MODIFY COLUMN command_type ENUM('add_user', 'update_user', 'delete_user', 'query_users') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE device_commands MODIFY COLUMN command_type ENUM('add_user', 'update_user', 'delete_user') NOT NULL");
    }
};
