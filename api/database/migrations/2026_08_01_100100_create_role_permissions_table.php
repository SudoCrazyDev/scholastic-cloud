<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per permission a role holds, e.g. "finance.manage".
     *
     * A row-per-permission rather than a JSON column so the set can be queried
     * ("which roles can approve voids?") and so adding a module to the catalog
     * never needs a data migration.
     */
    public function up(): void
    {
        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();

            // "<module>.<ability>". Validated against config/modules.php on the
            // way in rather than by a database constraint, so the catalog can
            // grow without a schema change.
            $table->string('permission', 100);
            $table->timestamps();

            $table->unique(['role_id', 'permission']);
            $table->index('permission');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_permissions');
    }
};
