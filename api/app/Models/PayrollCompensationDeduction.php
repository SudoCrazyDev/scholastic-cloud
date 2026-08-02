<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollCompensationDeduction extends Model
{
    use HasUuids;

    protected $fillable = [
        'payroll_compensation_id',
        'deduction_type_id',
        'amount',
        'rate_percent',
        'employer_amount',
        'employer_rate_percent',
        'is_exempt',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'rate_percent' => 'decimal:3',
        'employer_amount' => 'decimal:2',
        'employer_rate_percent' => 'decimal:3',
        'is_exempt' => 'boolean',
    ];

    public function compensation(): BelongsTo
    {
        return $this->belongsTo(PayrollCompensation::class, 'payroll_compensation_id');
    }

    public function deductionType(): BelongsTo
    {
        return $this->belongsTo(PayrollDeductionType::class, 'deduction_type_id');
    }
}
