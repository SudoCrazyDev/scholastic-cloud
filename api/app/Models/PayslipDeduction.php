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
        'amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(Payslip::class);
    }

    public function deductionType(): BelongsTo
    {
        return $this->belongsTo(PayrollDeductionType::class, 'deduction_type_id');
    }
}
