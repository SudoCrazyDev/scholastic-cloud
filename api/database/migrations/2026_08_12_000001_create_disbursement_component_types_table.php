<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * How the money physically left the school (e.g. Cash Dispense, Check,
     * Bank Transfer) — the *component* of a disbursement, kept separate from
     * disbursement_types, which says what the money was spent on.
     *
     * Every institution gets one row flagged is_default, "Cash Dispense". That
     * flag — not the name — is what the API resolves when a disbursement is
     * recorded without a component type, so a school may rename the row and
     * still keep a working default. The default row cannot be deleted.
     */
    public function up(): void
    {
        Schema::create('disbursement_component_types', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->string('name');
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->unique(['institution_id', 'name']);
            $table->index('institution_id');
        });

        $now = Carbon::now();

        foreach (DB::table('institutions')->pluck('id') as $institutionId) {
            DB::table('disbursement_component_types')->insert([
                'id' => (string) Str::uuid(),
                'institution_id' => $institutionId,
                'name' => 'Cash Dispense',
                'is_default' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('disbursement_component_types');
    }
};
