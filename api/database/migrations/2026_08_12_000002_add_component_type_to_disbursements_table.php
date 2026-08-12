<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Link a disbursement to how it was dispensed. Nullable and set-null on
     * delete, matching disbursement_type_id: removing a component type leaves
     * the money record standing.
     *
     * Disbursements recorded before this column existed are left null rather
     * than assumed to be cash — the school can set them from the edit form.
     */
    public function up(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->foreignUuid('disbursement_component_type_id')->nullable()->after('disbursement_type_id')
                ->references('id')->on('disbursement_component_types')->onDelete('set null');

            $table->index('disbursement_component_type_id');
        });
    }

    public function down(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->dropForeign(['disbursement_component_type_id']);
            $table->dropIndex(['disbursement_component_type_id']);
            $table->dropColumn('disbursement_component_type_id');
        });
    }
};
