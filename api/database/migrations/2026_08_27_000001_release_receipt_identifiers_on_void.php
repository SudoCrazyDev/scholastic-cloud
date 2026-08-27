<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A void mark on the receipt header.
     *
     * The void lived only on the line items, which left no way to ask whether a
     * collection still stands without counting its lines. `applyVoid` now stamps the
     * header too, once none of its items are left standing, and the receipt identifier
     * warning uses it: a number that is only on a voided receipt is not reported as
     * being in use, because the cashier re-keying a void they just made is the one case
     * where reuse is certainly right.
     *
     * This migration also used to move the identifier unique indexes onto generated
     * columns so a void would release the number. The numbers are no longer unique at
     * all, so there is nothing to release; see
     * 2026_08_27_000002_stop_holding_or_numbers_to_one_collection.
     */
    public function up(): void
    {
        if (Schema::hasColumn('payment_transactions', 'voided_at')) {
            return;
        }

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
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE `payment_transactions` DROP COLUMN `voided_at`');
    }
};
