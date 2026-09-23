<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lets a grade item sit outside the components of summative assessment.
 *
 * A teacher records these to keep a mark on file without it weighing on the
 * quarter grade, so they must never reach the class record. Dropping the
 * component is what excludes them — `RunningGradeRecalcService` and both class
 * records walk the components to find their items, so an item with none is
 * invisible to all three.
 *
 * `subject_ecr_id` was also the item's only route back to its subject, so the
 * subject is now recorded on the item itself and backfilled for every existing
 * row. Reads resolve the subject through the component when there is one and
 * fall back to this column when there is not.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->uuid('subject_id')->nullable()->after('id');
            $table->index('subject_id');
        });

        DB::table('subject_ecr_items')
            ->join('subjects_ecr', 'subjects_ecr.id', '=', 'subject_ecr_items.subject_ecr_id')
            ->update(['subject_ecr_items.subject_id' => DB::raw('subjects_ecr.subject_id')]);

        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->uuid('subject_ecr_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Items that never had a component cannot be represented by the old shape.
        DB::table('subject_ecr_items')->whereNull('subject_ecr_id')->delete();

        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->uuid('subject_ecr_id')->nullable(false)->change();
            $table->dropIndex(['subject_id']);
            $table->dropColumn('subject_id');
        });
    }
};
