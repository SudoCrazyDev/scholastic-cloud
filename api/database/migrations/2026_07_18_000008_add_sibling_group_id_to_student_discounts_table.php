<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_discounts', function (Blueprint $table) {
            // set null (not cascade) so dissolving a sibling group never
            // deletes financial records; the discount row stays voidable.
            $table->foreignUuid('sibling_group_id')->nullable()->after('school_fee_id')
                ->references('id')->on('sibling_groups')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('student_discounts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sibling_group_id');
        });
    }
};
