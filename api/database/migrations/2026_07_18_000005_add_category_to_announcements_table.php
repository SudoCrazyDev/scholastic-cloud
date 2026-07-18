<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            // Which authoring surface the announcement belongs to. 'finance'
            // posts (the Finance > Announcements page) are always forced to
            // audience=students, scope=institution.
            $table->string('category')->default('general')->after('author_role');

            $table->index(['institution_id', 'category'], 'announcements_institution_category_idx');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->dropIndex('announcements_institution_category_idx');
            $table->dropColumn('category');
        });
    }
};
