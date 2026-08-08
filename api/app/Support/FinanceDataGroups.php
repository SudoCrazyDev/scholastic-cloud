<?php

namespace App\Support;

/**
 * What Finance data a school is allowed to clear, and what clearing it costs.
 *
 * A school that has finished piloting — or that keyed a year in twice — needs a
 * way to take the money data back out without a developer on a database
 * console. This class is the single source of truth for that: the groups the
 * screen offers, the tables behind each one, and the damage each one can do to
 * the rows it is *not* deleting.
 *
 * Three things are deliberately **not** clearable, and none of them appear
 * below: payment plans (`payment_plans`, `payment_plan_installments`,
 * `student_payment_plans`, `student_payment_plan_changes`), finance
 * announcements, and disbursements (`disbursements`, `disbursement_types`,
 * `disbursement_receipts`). They are configuration and outgoing-money records
 * that outlive a year's collections, so the clear leaves them standing.
 *
 * ## Year-scoped vs catalog groups
 *
 * A clear is scoped to one academic year, but only some of these tables carry
 * an `academic_year`. Groups are therefore one of two kinds:
 *
 *  - **year-scoped** — the delete is filtered to the chosen year. Clearing
 *    2025-2026 leaves 2024-2025 alone.
 *  - **catalog** — the table has no year at all (a fee type is not "for" a
 *    year), so the group empties it for the whole institution. The UI has to
 *    say so, which is what `scope` is read for.
 *
 * ## Why `dependents` exists
 *
 * Every foreign key into these tables is `CASCADE` or `SET NULL` — not one is
 * `RESTRICT`. So nothing here ever *fails*; it quietly succeeds and takes
 * something else with it. Clearing the fee catalog while last year's payments
 * are still on file does not error, it nulls their `school_fee_id` and turns
 * every fee-attributed receipt into a "General / Other" line, silently
 * destroying the per-fee reporting for a year nobody asked to touch.
 *
 * `dependents` names those relationships so FinanceDataCleaner can count the
 * rows that would survive the clear while pointing at something it deleted, and
 * refuse rather than corrupt them.
 */
class FinanceDataGroups
{
    /** A group whose tables carry `academic_year` and are cleared one year at a time. */
    public const SCOPE_YEAR = 'year';

    /** A group whose tables have no year; clearing it empties the institution's catalog. */
    public const SCOPE_CATALOG = 'catalog';

    /**
     * The clearable groups, in the order the screen lists them.
     *
     * `tables` is in **delete order** — a table is listed before the table it
     * points at, so a run never leaves a dangling reference mid-transaction
     * even where the database would have nulled it for us.
     *
     * @return array<string, array{
     *     label: string,
     *     description: string,
     *     scope: string,
     *     tables: array<string>,
     *     soft_deletes: array<string>,
     * }>
     */
    public static function all(): array
    {
        return [
            'payments' => [
                'label' => 'Payments & Receipts',
                'description' => 'Every posted payment, its receipt header, void requests, student receipt uploads and online payment attempts.',
                'scope' => self::SCOPE_YEAR,
                'tables' => [
                    // Points at student_payments; goes first so the payment rows
                    // are unreferenced by the time they are deleted.
                    'payment_receipt_submissions',
                    'payment_void_requests',
                    'student_online_payment_transactions',
                    'student_payments',
                    'payment_transactions',
                ],
                'soft_deletes' => [],
            ],

            'additional_fees' => [
                'label' => 'Additional Charges & Late Fees',
                'description' => 'Per-student ad-hoc charges and every surcharge LateFeeService booked, including charges already waived.',
                'scope' => self::SCOPE_YEAR,
                'tables' => ['student_additional_fees'],
                // Waiving a late fee soft-deletes it, and a waived row still
                // holds the slot in the unique index that stops it being
                // re-charged. Clearing has to take the trashed rows too or the
                // year comes back with charges nobody can see or collect.
                'soft_deletes' => ['student_additional_fees'],
            ],

            'applied_discounts' => [
                'label' => 'Applied Discounts',
                'description' => "Discounts granted to students and whole grade levels for the year, plus the per-student voids recorded against grade-level discounts.",
                'scope' => self::SCOPE_YEAR,
                'tables' => [
                    'grade_level_discount_student_voids',
                    'student_discounts',
                    'grade_level_discounts',
                ],
                'soft_deletes' => [],
            ],

            'fee_amounts' => [
                'label' => 'School Fee Amounts',
                'description' => 'The per-grade-level amount each fee is charged at for the year. Fee types themselves are kept.',
                'scope' => self::SCOPE_YEAR,
                'tables' => ['school_fee_defaults'],
                'soft_deletes' => [],
            ],

            'school_fee_catalog' => [
                'label' => 'School Fee Types',
                'description' => 'The fee catalog itself (Tuition, Books…). Has no academic year, so this empties it for every year at once.',
                'scope' => self::SCOPE_CATALOG,
                'tables' => ['school_fees'],
                'soft_deletes' => [],
            ],

            'student_fee_catalog' => [
                'label' => 'Student Fee Templates',
                'description' => 'Reusable fee templates the ledger offers when adding a charge. No academic year, so this empties the whole list.',
                'scope' => self::SCOPE_CATALOG,
                'tables' => ['student_fees'],
                'soft_deletes' => [],
            ],

            'discount_templates' => [
                'label' => 'Default Discount Templates',
                'description' => 'Named reusable discounts the ledger form prefills from. Nothing already granted to a student depends on these.',
                'scope' => self::SCOPE_CATALOG,
                'tables' => ['default_discounts'],
                'soft_deletes' => [],
            ],

            'sibling_groups' => [
                'label' => 'Sibling Groups',
                'description' => 'Sibling links between students and their membership rows. Discounts already applied through a group are not removed by this.',
                'scope' => self::SCOPE_CATALOG,
                'tables' => ['sibling_group_members', 'sibling_groups'],
                'soft_deletes' => [],
            ],

            'receipt_templates' => [
                'label' => 'Receipt Templates',
                'description' => 'Printed-receipt layouts built in the Receipt Builder. Clearing these leaves printing on the built-in default layout.',
                'scope' => self::SCOPE_CATALOG,
                'tables' => ['receipt_templates'],
                'soft_deletes' => [],
            ],
        ];
    }

    /**
     * @return array<string>
     */
    public static function keys(): array
    {
        return array_keys(self::all());
    }

    public static function exists(string $group): bool
    {
        return array_key_exists($group, self::all());
    }

    public static function label(string $group): string
    {
        return self::all()[$group]['label'] ?? $group;
    }

    /**
     * Tables a group deletes from, in delete order.
     *
     * @return array<string>
     */
    public static function tables(string $group): array
    {
        return self::all()[$group]['tables'] ?? [];
    }

    /**
     * Every table any of these groups touches, de-duplicated.
     *
     * @param  array<string>  $groups
     * @return array<string>
     */
    public static function tablesFor(array $groups): array
    {
        $tables = [];

        foreach ($groups as $group) {
            foreach (self::tables($group) as $table) {
                $tables[$table] = true;
            }
        }

        return array_keys($tables);
    }

    /**
     * Tables carrying `academic_year`, so a clear can filter them to one year.
     *
     * Kept as an explicit list rather than probed off the schema: a column
     * appearing on a table later must not silently change what a clear deletes.
     *
     * @return array<string>
     */
    public static function yearScopedTables(): array
    {
        return [
            'school_fee_defaults',
            'grade_level_discounts',
            'grade_level_discount_student_voids',
            'payment_transactions',
            'student_payments',
            'student_discounts',
            'student_additional_fees',
            'payment_void_requests',
            'payment_receipt_submissions',
            'student_online_payment_transactions',
        ];
    }

    public static function isYearScoped(string $table): bool
    {
        return in_array($table, self::yearScopedTables(), true);
    }

    /**
     * Tables with no `institution_id` of their own.
     *
     * `sibling_group_members` hangs off its group and is scoped through it.
     *
     * @return array<string, array{parent: string, foreign_key: string}>
     */
    public static function scopedThroughParent(): array
    {
        return [
            'sibling_group_members' => [
                'parent' => 'sibling_groups',
                'foreign_key' => 'sibling_group_id',
            ],
        ];
    }

    /**
     * Rows elsewhere that point at a table this clear may delete from.
     *
     * Keyed by the table being deleted; each entry is a child that references
     * it. `rule` records what the database would do — `set_null` strands the
     * child on a null reference, `cascade` deletes the child outright — and
     * both are reported the same way to the caller, because both destroy data
     * the operator did not ask to lose.
     *
     * Only relationships that can reach **outside** the clear are listed.
     * References between two tables in the same group (a payment line to its
     * own receipt header) are handled by the delete order above and are not
     * hazards.
     *
     * @return array<string, array<int, array{table: string, column: string, rule: string, note: string}>>
     */
    public static function dependents(): array
    {
        return [
            'school_fees' => [
                [
                    'table' => 'school_fee_defaults',
                    'column' => 'school_fee_id',
                    'rule' => 'cascade',
                    'note' => 'every other year\'s amounts for the fee would be deleted with it',
                ],
                [
                    'table' => 'student_payments',
                    'column' => 'school_fee_id',
                    'rule' => 'set_null',
                    'note' => 'payments would lose the fee they settled and report as General / Other',
                ],
                [
                    'table' => 'student_discounts',
                    'column' => 'school_fee_id',
                    'rule' => 'set_null',
                    'note' => 'discounts tied to the fee would become untargeted',
                ],
                [
                    'table' => 'grade_level_discounts',
                    'column' => 'school_fee_id',
                    'rule' => 'set_null',
                    'note' => 'grade-level discounts tied to the fee would become untargeted',
                ],
                [
                    'table' => 'student_online_payment_transactions',
                    'column' => 'school_fee_id',
                    'rule' => 'set_null',
                    'note' => 'online payments would lose the fee they were raised for',
                ],
            ],

            'student_fees' => [
                [
                    'table' => 'student_additional_fees',
                    'column' => 'student_fee_id',
                    'rule' => 'set_null',
                    'note' => 'posted charges would lose the template they were traced back to',
                ],
            ],

            'sibling_groups' => [
                [
                    'table' => 'student_discounts',
                    'column' => 'sibling_group_id',
                    'rule' => 'set_null',
                    'note' => 'sibling discounts already granted would lose the group that justified them',
                ],
            ],

            'student_additional_fees' => [
                [
                    'table' => 'student_payments',
                    'column' => 'student_additional_fee_id',
                    'rule' => 'set_null',
                    'note' => 'payments against the charge would report as General / Other',
                ],
            ],
        ];
    }

    /**
     * @return array<int, array{table: string, column: string, rule: string, note: string}>
     */
    public static function dependentsOf(string $table): array
    {
        return self::dependents()[$table] ?? [];
    }
}
