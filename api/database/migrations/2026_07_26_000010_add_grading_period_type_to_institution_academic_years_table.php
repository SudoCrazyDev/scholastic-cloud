<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * DepEd's newer structure splits the school year into 3 terms instead of 4
     * quarters. Not every institution adopts it at the same time, and the switch
     * happens on a school-year boundary, so the structure is recorded per
     * academic year: past years keep their 4-quarter grades and report cards
     * untouched while a later year runs on 3 terms.
     */
    public function up(): void
    {
        Schema::table('institution_academic_years', function (Blueprint $table) {
            $table->enum('grading_period_type', ['quarter', 'term'])
                ->default('quarter')
                ->after('year');
        });
    }

    public function down(): void
    {
        Schema::table('institution_academic_years', function (Blueprint $table) {
            $table->dropColumn('grading_period_type');
        });
    }
};
