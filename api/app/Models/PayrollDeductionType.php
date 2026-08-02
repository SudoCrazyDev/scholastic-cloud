<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

class PayrollDeductionType extends Model
{
    use HasUuids;

    /** A flat peso figure, the same every period. */
    public const CALC_FIXED = 'fixed';

    /** A percentage of the salary named by `percent_basis`. */
    public const CALC_PERCENTAGE = 'percentage';

    /**
     * A table of salary ranges: the salary named by `percent_basis` picks one
     * range, and that range says what the employee and the employer each pay.
     * This is the shape the contribution schedules actually publish.
     */
    public const CALC_BRACKET = 'bracket';

    /**
     * Daily rate × scheduled working days — the salary with no late,
     * undertime or absence taken off. This is the basis contributions like
     * SSS are computed on: a late arrival must not shrink the contribution.
     */
    public const BASIS_BASIC_PAY = 'basic_pay';

    /** What the staff member actually earned, penalties and all. */
    public const BASIS_GROSS_PAY = 'gross_pay';

    public const CALCULATION_TYPES = [self::CALC_FIXED, self::CALC_PERCENTAGE, self::CALC_BRACKET];

    public const PERCENT_BASES = [self::BASIS_BASIC_PAY, self::BASIS_GROSS_PAY];

    protected $fillable = [
        'institution_id',
        'name',
        'calculation_type',
        'default_amount',
        'rate_percent',
        'has_employer_share',
        'default_employer_amount',
        'employer_rate_percent',
        'percent_basis',
        'is_active',
        'sort_order',
        'created_by',
    ];

    protected $casts = [
        'default_amount' => 'decimal:2',
        'rate_percent' => 'decimal:3',
        'has_employer_share' => 'boolean',
        'default_employer_amount' => 'decimal:2',
        'employer_rate_percent' => 'decimal:3',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function isPercentage(): bool
    {
        return $this->calculation_type === self::CALC_PERCENTAGE;
    }

    public function isBracket(): bool
    {
        return $this->calculation_type === self::CALC_BRACKET;
    }

    /**
     * The salary range this salary falls in, or null when the type has no
     * table at all.
     *
     * A salary under the lowest range still contributes at the lowest one, and
     * a salary past the highest at the highest — that is how the published
     * schedules read ("₱4,250 and below", "₱29,750 and over"), and it is what
     * keeps a table with a gap in it from silently dropping somebody's
     * contribution to zero.
     *
     * @param  Collection<int, PayrollDeductionBracket>|null  $brackets  defaults to the loaded relation
     */
    public function bracketFor(float $salary, ?Collection $brackets = null): ?PayrollDeductionBracket
    {
        $ordered = ($brackets ?? $this->brackets)
            ->sortBy(fn (PayrollDeductionBracket $bracket) => (float) $bracket->min_salary)
            ->values();

        if ($ordered->isEmpty()) {
            return null;
        }

        $match = $ordered->first(fn (PayrollDeductionBracket $bracket) => $bracket->covers($salary));
        if ($match !== null) {
            return $match;
        }

        // Below the floor, or in a gap the school left between two ranges: the
        // nearest range at or under the salary, falling back to the lowest.
        return $ordered->last(fn (PayrollDeductionBracket $bracket) => (float) $bracket->min_salary <= $salary)
            ?? $ordered->first();
    }

    public function brackets(): HasMany
    {
        return $this->hasMany(PayrollDeductionBracket::class, 'deduction_type_id')
            ->orderBy('min_salary')
            ->orderBy('sort_order');
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }
}
