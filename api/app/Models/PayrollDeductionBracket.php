<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One salary range of a bracket deduction type: the salaries it covers, and
 * what the employee and the employer each pay inside it.
 */
class PayrollDeductionBracket extends Model
{
    use HasUuids;

    /** The range names two peso figures (the SSS schedule). */
    public const AMOUNT_FIXED = 'fixed';

    /** The range names two rates, taken from the salary that matched it. */
    public const AMOUNT_PERCENTAGE = 'percentage';

    public const AMOUNT_TYPES = [self::AMOUNT_FIXED, self::AMOUNT_PERCENTAGE];

    protected $fillable = [
        'deduction_type_id',
        'min_salary',
        'max_salary',
        'amount_type',
        'employee_amount',
        'employee_rate_percent',
        'employer_amount',
        'employer_rate_percent',
        'sort_order',
    ];

    protected $casts = [
        'min_salary' => 'decimal:2',
        'max_salary' => 'decimal:2',
        'employee_amount' => 'decimal:2',
        'employee_rate_percent' => 'decimal:3',
        'employer_amount' => 'decimal:2',
        'employer_rate_percent' => 'decimal:3',
        'sort_order' => 'integer',
    ];

    public function isPercentage(): bool
    {
        return $this->amount_type === self::AMOUNT_PERCENTAGE;
    }

    /** Inclusive on both ends; a null ceiling is the open-ended top range. */
    public function covers(float $salary): bool
    {
        if ($salary < (float) $this->min_salary) {
            return false;
        }

        return $this->max_salary === null || $salary <= (float) $this->max_salary;
    }

    /** What the employee pays inside this range, at the salary that matched it. */
    public function employeeShare(float $salary): float
    {
        return $this->isPercentage()
            ? round($salary * (float) $this->employee_rate_percent / 100, 2)
            : round((float) $this->employee_amount, 2);
    }

    /** What the employer pays inside this range. */
    public function employerShare(float $salary): float
    {
        return $this->isPercentage()
            ? round($salary * (float) $this->employer_rate_percent / 100, 2)
            : round((float) $this->employer_amount, 2);
    }

    public function deductionType(): BelongsTo
    {
        return $this->belongsTo(PayrollDeductionType::class, 'deduction_type_id');
    }
}
