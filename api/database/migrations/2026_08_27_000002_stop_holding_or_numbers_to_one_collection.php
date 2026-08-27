<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * An OR number may name more than one collection, so nothing holds it unique.
     *
     * The rule was wrong about how a school writes receipts. One OR routinely covers
     * several postings — the tuition and the ₱60 that came with it go in as two entries,
     * siblings pay on one receipt, an installment is settled in two goes — and a school
     * whose books already read that way could not even run the migration that imposed
     * it. Uniqueness is now a warning the cashier sees, not a refusal; see
     * PaymentIdentifierRegistry.
     *
     * The two migrations that built it no longer create anything, so on most databases
     * this has nothing to do. It exists for the ones that ran them first, and takes back
     * exactly what they left: the unique indexes over each identifier, and the generated
     * columns that held the live copy of the number for them.
     *
     * `voided_at` on the header stays. It outlived the index it was added for — the
     * warning uses it to keep quiet about receipts that were taken back.
     */
    public function up(): void
    {
        $unique = [
            'payment_transactions_institution_live_or_unique',
            'payment_transactions_institution_live_reference_unique',
            'payment_transactions_institution_or_unique',
            'payment_transactions_institution_reference_unique',
        ];

        // Every one of these leads with institution_id, and InnoDB will refuse to drop
        // the last index backing that column's foreign key. Give it a plain one first
        // when nothing else covers it.
        if (array_filter($unique, fn ($index) => self::hasIndex($index)) !== []) {
            self::ensureInstitutionIndex($unique);
        }

        foreach ($unique as $index) {
            if (self::hasIndex($index)) {
                DB::statement("ALTER TABLE `payment_transactions` DROP INDEX `{$index}`");
            }
        }

        foreach (['live_or_number', 'live_reference_number'] as $column) {
            if (self::hasColumn($column)) {
                DB::statement("ALTER TABLE `payment_transactions` DROP COLUMN `{$column}`");
            }
        }
    }

    /**
     * Deliberately not reversible. Rolling the unique indexes back would fail on any
     * school whose books already reuse a number, which is the reason they came out.
     */
    public function down(): void
    {
        //
    }

    private static function hasIndex(string $name): bool
    {
        return DB::selectOne(
            'SELECT 1 FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
            ['payment_transactions', $name]
        ) !== null;
    }

    private static function hasColumn(string $name): bool
    {
        return DB::selectOne(
            'SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1',
            ['payment_transactions', $name]
        ) !== null;
    }

    /**
     * @param  string[]  $dropping  indexes that are about to go and so cannot count
     */
    private static function ensureInstitutionIndex(array $dropping): void
    {
        $survivor = DB::selectOne(
            'SELECT index_name FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = ?
               AND column_name = ? AND seq_in_index = 1
               AND index_name NOT IN ('.implode(',', array_fill(0, count($dropping), '?')).')
             LIMIT 1',
            array_merge(['payment_transactions', 'institution_id'], $dropping)
        );

        if ($survivor === null) {
            DB::statement('ALTER TABLE `payment_transactions` ADD INDEX `payment_transactions_institution_id_index` (`institution_id`)');
        }
    }
};
