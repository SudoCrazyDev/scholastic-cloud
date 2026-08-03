<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One collection off the schedule: what it costs, when it is due, and — once a
 * payroll period carrying it has been released — which payslip took it.
 */
class StaffLoanInstallment extends Model
{
    use HasUuids;

    /** Due, not yet taken. */
    public const STATUS_SCHEDULED = 'scheduled';

    /** Taken by a released payslip. */
    public const STATUS_COLLECTED = 'collected';

    /** The loan was called off before this one came due. */
    public const STATUS_CANCELLED = 'cancelled';

    public const STATUSES = [
        self::STATUS_SCHEDULED,
        self::STATUS_COLLECTED,
        self::STATUS_CANCELLED,
    ];

    protected $fillable = [
        'staff_loan_id',
        'sequence',
        'due_date',
        'amount',
        'principal_component',
        'interest_component',
        'opening_balance',
        'closing_balance',
        'status',
        'collected_amount',
        'collected_at',
        'payslip_id',
        'payroll_period_id',
    ];

    protected $casts = [
        'sequence' => 'integer',
        'due_date' => 'date',
        'amount' => 'decimal:2',
        'principal_component' => 'decimal:2',
        'interest_component' => 'decimal:2',
        'opening_balance' => 'decimal:2',
        'closing_balance' => 'decimal:2',
        'collected_amount' => 'decimal:2',
        'collected_at' => 'datetime',
    ];

    public function isCollected(): bool
    {
        return $this->status === self::STATUS_COLLECTED;
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(StaffLoan::class, 'staff_loan_id');
    }

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(Payslip::class);
    }
}
