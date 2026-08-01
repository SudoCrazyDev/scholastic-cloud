<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Roles were global: one flat list shared by every institution, editable
     * only by super-administrators. An institution creating its own roles
     * needs them scoped to itself, so a school inventing a "Cashier" role
     * cannot see (or collide with) another school's "Cashier".
     *
     * Existing rows become system roles (institution_id null), which keeps
     * every current user_institutions.role_id pointing somewhere valid.
     */
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->foreignUuid('institution_id')
                ->nullable()
                ->after('id')
                ->constrained('institutions')
                ->cascadeOnDelete();

            // Built-in roles the platform ships and an institution may not
            // rename or delete. Distinct from institution_id being null, so a
            // future platform-level custom role stays possible.
            $table->boolean('is_system')->default(false)->after('slug');
        });

        DB::table('roles')->update(['is_system' => true]);

        // Slug is only unique within an institution now — two schools may both
        // have a "cashier". Dropping the global unique index requires naming
        // it explicitly because Doctrine is not installed.
        Schema::table('roles', function (Blueprint $table) {
            $table->dropUnique('roles_slug_unique');
            $table->unique(['institution_id', 'slug'], 'roles_institution_slug_unique');
        });
    }

    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropUnique('roles_institution_slug_unique');
        });

        // Institution-created roles can collide on slug, so they have to go
        // before the global unique index can come back.
        DB::table('roles')->whereNotNull('institution_id')->delete();

        Schema::table('roles', function (Blueprint $table) {
            $table->unique('slug', 'roles_slug_unique');
            $table->dropConstrainedForeignId('institution_id');
            $table->dropColumn('is_system');
        });
    }
};
