<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * A voided receipt gives its OR number and reference number back.
     *
     * The numbers stay unique among the collections that still stand, but a void is
     * usually the cashier catching their own keying mistake seconds later — wrong
     * student, wrong amount — while the physical OR is still the one in their hand.
     * Reserving the number forever meant the till could never record what that OR
     * actually collected.
     *
     * MySQL has no partial index, so uniqueness moves onto a stored generated column
     * that holds the number only while the receipt is live and NULL once it is voided.
     * NULLs in a unique index are all distinct, so any number of voided receipts may
     * have carried the same number, while two live ones still cannot. `or_number`
     * itself is untouched — the voided row keeps showing what it was issued against.
     *
     * `payment_transactions` needs a void mark of its own for that. Until now the void
     * lived only on the line items; the header now carries the same stamp, set when
     * none of its items are left standing.
     *
     * The new indexes go in before the old ones come out: both pairs lead with
     * `institution_id`, and InnoDB is leaning on whichever one it can find to back that
     * column's foreign key. Dropping first leaves the key unindexed and MySQL refuses.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE `payment_transactions` ADD COLUMN `voided_at` timestamp NULL DEFAULT NULL AFTER `received_by`');

        // Backfill: a header is voided when it has items and none of them survive.
        DB::statement('
            UPDATE `payment_transactions` pt
            JOIN (
                SELECT `payment_transaction_id`,
                       MAX(`voided_at`) AS `voided_at`,
                       COUNT(*) AS `lines`,
                       SUM(`voided_at` IS NOT NULL) AS `voided_lines`
                FROM `student_payments`
                WHERE `payment_transaction_id` IS NOT NULL
                GROUP BY `payment_transaction_id`
            ) sp ON sp.`payment_transaction_id` = pt.`id`
            SET pt.`voided_at` = sp.`voided_at`
            WHERE sp.`lines` = sp.`voided_lines`
        ');

        DB::statement('
            ALTER TABLE `payment_transactions`
            ADD COLUMN `live_or_number` varchar(255)
                GENERATED ALWAYS AS (CASE WHEN `voided_at` IS NULL THEN `or_number` END) STORED,
            ADD COLUMN `live_reference_number` varchar(255)
                GENERATED ALWAYS AS (CASE WHEN `voided_at` IS NULL THEN `reference_number` END) STORED
        ');

        DB::statement('
            ALTER TABLE `payment_transactions`
            ADD UNIQUE KEY `payment_transactions_institution_live_or_unique` (`institution_id`, `live_or_number`),
            ADD UNIQUE KEY `payment_transactions_institution_live_reference_unique` (`institution_id`, `live_reference_number`)
        ');

        DB::statement('ALTER TABLE `payment_transactions` DROP INDEX `payment_transactions_institution_or_unique`');
        DB::statement('ALTER TABLE `payment_transactions` DROP INDEX `payment_transactions_institution_reference_unique`');
    }

    public function down(): void
    {
        // Rolling back re-reserves voided numbers, so a receipt reissued in the
        // meantime would collide. Keep the newest holder and clear the older ones
        // rather than fail the rollback.
        foreach (['or_number', 'reference_number'] as $field) {
            DB::statement("
                UPDATE `payment_transactions` pt
                JOIN (
                    SELECT older.`id`
                    FROM `payment_transactions` older
                    JOIN `payment_transactions` newer
                      ON newer.`institution_id` = older.`institution_id`
                     AND newer.`{$field}` = older.`{$field}`
                     AND (newer.`created_at` > older.`created_at`
                          OR (newer.`created_at` = older.`created_at` AND newer.`id` > older.`id`))
                    WHERE older.`{$field}` IS NOT NULL
                ) dupes ON dupes.`id` = pt.`id`
                SET pt.`{$field}` = NULL
            ");
        }

        DB::statement('
            ALTER TABLE `payment_transactions`
            ADD UNIQUE KEY `payment_transactions_institution_or_unique` (`institution_id`, `or_number`),
            ADD UNIQUE KEY `payment_transactions_institution_reference_unique` (`institution_id`, `reference_number`)
        ');

        DB::statement('ALTER TABLE `payment_transactions` DROP INDEX `payment_transactions_institution_live_or_unique`');
        DB::statement('ALTER TABLE `payment_transactions` DROP INDEX `payment_transactions_institution_live_reference_unique`');
        DB::statement('ALTER TABLE `payment_transactions` DROP COLUMN `live_or_number`, DROP COLUMN `live_reference_number`');
        DB::statement('ALTER TABLE `payment_transactions` DROP COLUMN `voided_at`');
    }
};
