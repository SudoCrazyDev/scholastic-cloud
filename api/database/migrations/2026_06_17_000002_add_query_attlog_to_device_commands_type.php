<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add 'query_attlog' so admins can pull historical punches from an ADMS
        // device on demand (DATA QUERY ATTLOG StartTime=.. EndTime=..).
        DB::statement("ALTER TABLE device_commands MODIFY COLUMN command_type ENUM('add_user', 'update_user', 'delete_user', 'query_users', 'query_attlog') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE device_commands MODIFY COLUMN command_type ENUM('add_user', 'update_user', 'delete_user', 'query_users') NOT NULL");
    }
};
