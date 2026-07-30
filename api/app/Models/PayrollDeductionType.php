<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollDeductionType extends Model
{
    use HasUuids;

    /** A flat peso figure, the same every period. */
    public const CALC_FIXED = 'fixed';

    /** A percentage of the salary named by `percent_basis`. */
    public const CALC_PERCENTAGE = 'percentage';

    /**
     * Daily rate × scheduled working days — the salary with no late,
     * undertime or absence taken off. This is the basis contributions like
     * SSS are computed on: a late arrival must not shrink the contribution.
     */
    public const BASIS_BASIC_PAY = 'basic_pay';

    /** What the staff member actually earned, penalties and all. */
    public const BASIS_GROSS_PAY = 'gross_pay';

    public const CALCULATION_TYPES = [self::CALC_FIXED, self::CALC_PERCENTAGE];

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

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }
}
