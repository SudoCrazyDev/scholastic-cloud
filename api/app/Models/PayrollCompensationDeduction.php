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
        'employer_amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'employer_amount' => 'decimal:2',
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
