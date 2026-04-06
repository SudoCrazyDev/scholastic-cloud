<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE `institution_academic_years` (
                `id` uuid NOT NULL,
                `institution_id` uuid NOT NULL,
                `year` varchar(255) NOT NULL,
                `is_current` tinyint(1) NOT NULL DEFAULT '0',
                `created_at` timestamp NULL DEFAULT NULL,
                `updated_at` timestamp NULL DEFAULT NULL,
                PRIMARY KEY (`id`),
                UNIQUE KEY `institution_academic_years_institution_id_year_unique` (`institution_id`, `year`),
                CONSTRAINT `institution_academic_years_institution_id_foreign`
                    FOREIGN KEY (`institution_id`) REFERENCES `institutions` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS `institution_academic_years`');
    }
};
