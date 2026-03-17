<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE `class_sections` ADD COLUMN `track_id` uuid DEFAULT NULL AFTER `department_id`");
        DB::statement("ALTER TABLE `class_sections` ADD COLUMN `strand_id` uuid DEFAULT NULL AFTER `track_id`");
        DB::statement("ALTER TABLE `class_sections` ADD CONSTRAINT `class_sections_track_id_foreign` FOREIGN KEY (`track_id`) REFERENCES `tracks` (`id`) ON DELETE SET NULL");
        DB::statement("ALTER TABLE `class_sections` ADD CONSTRAINT `class_sections_strand_id_foreign` FOREIGN KEY (`strand_id`) REFERENCES `strands` (`id`) ON DELETE SET NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE `class_sections` DROP FOREIGN KEY `class_sections_strand_id_foreign`");
        DB::statement("ALTER TABLE `class_sections` DROP FOREIGN KEY `class_sections_track_id_foreign`");
        DB::statement("ALTER TABLE `class_sections` DROP COLUMN `strand_id`");
        DB::statement("ALTER TABLE `class_sections` DROP COLUMN `track_id`");
    }
};
