<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Blanks in the two receipt identifiers become NULL: "not issued" is an absence, not
     * the number "".
     *
     * This migration used to add unique indexes on (institution, or_number) and
     * (institution, reference_number) as well. It no longer does, and the pair is not
     * held unique anywhere — see
     * 2026_08_27_000002_stop_holding_or_numbers_to_one_collection, which takes the
     * indexes back out of the databases that ran this before the rule was reversed, and
     * PaymentIdentifierRegistry, which explains why a school reuses an OR number
     * legitimately. The index creation is dropped from here rather than left to be undone
     * a migration later, because a school whose books already reuse a number could not
     * get past it: the statement fails outright on its own data.
     *
     * The normalization stays. It is right whether or not anything is indexed, and the
     * warning that now replaces the rule reads better for it.
     */
    public function up(): void
    {
        foreach (['payment_transactions', 'student_payments'] as $table) {
            DB::table($table)->where('or_number', '')->update(['or_number' => null]);
            DB::table($table)->where('reference_number', '')->update(['reference_number' => null]);
        }
    }

    public function down(): void
    {
        // Normalizing a blank to NULL is not worth restoring: "" and NULL both mean the
        // school issued no number, and putting the empty strings back would only make
        // two spellings of nothing again.
    }
};
