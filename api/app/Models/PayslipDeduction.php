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
        'staff_loan_id',
        'staff_loan_installment_id',
        'name',
        'calculation_type',
        'amount',
        'rate_percent',
        'employer_amount',
        'employer_rate_percent',
        'percent_basis',
        'basis_amount',
        'bracket_min',
        'bracket_max',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'rate_percent' => 'decimal:3',
        'employer_amount' => 'decimal:2',
        'employer_rate_percent' => 'decimal:3',
        'basis_amount' => 'decimal:2',
        'bracket_min' => 'decimal:2',
        'bracket_max' => 'decimal:2',
    ];

    public function isPercentage(): bool
    {
        return $this->calculation_type === PayrollDeductionType::CALC_PERCENTAGE;
    }

    public function isBracket(): bool
    {
        return $this->calculation_type === PayrollDeductionType::CALC_BRACKET;
    }

    /** One installment of an approved staff loan rather than a catalog deduction. */
    public function isLoan(): bool
    {
        return $this->staff_loan_id !== null;
    }

    /**
     * Which column of the payroll sheet — and which row of the period report —
     * this line belongs to.
     *
     * Lines off the same catalog type share a column, and ad-hoc lines group by
     * name. Every loan line in the school shares one column: each carries its
     * own reference and installment number in its name, so grouping by name
     * would hand a fifty-employee sheet fifty one-cell columns.
     */
    public function groupingKey(): string
    {
        if ($this->isLoan()) {
            return 'staff-loan';
        }

        return $this->deduction_type_id ?: 'name:'.mb_strtolower(trim($this->name));
    }

    /** The heading that key prints under. */
    public function groupingLabel(): string
    {
        return $this->isLoan() ? 'Staff Loan' : $this->name;
    }

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(Payslip::class);
    }

    public function deductionType(): BelongsTo
    {
        return $this->belongsTo(PayrollDeductionType::class, 'deduction_type_id');
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(StaffLoan::class, 'staff_loan_id');
    }

    /** The scheduled collection this line is paying down. */
    public function installment(): BelongsTo
    {
        return $this->belongsTo(StaffLoanInstallment::class, 'staff_loan_installment_id');
    }
}
