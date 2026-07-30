<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayslipDeduction extends Model
{
    use HasUuids;

    protected $fillable = [
        'payslip_id',
        'deduction_type_id',
        'name',
        'calculation_type',
        'amount',
        'rate_percent',
        'employer_amount',
        'employer_rate_percent',
        'percent_basis',
        'basis_amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'rate_percent' => 'decimal:3',
        'employer_amount' => 'decimal:2',
        'employer_rate_percent' => 'decimal:3',
        'basis_amount' => 'decimal:2',
    ];

    public function isPercentage(): bool
    {
        return $this->calculation_type === PayrollDeductionType::CALC_PERCENTAGE;
    }

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(Payslip::class);
    }

    public function deductionType(): BelongsTo
    {
        return $this->belongsTo(PayrollDeductionType::class, 'deduction_type_id');
    }
}
