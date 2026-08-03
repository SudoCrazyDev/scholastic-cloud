<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Money the school lent a staff member, collected back over a fixed number of
 * months through payroll.
 *
 * The loan holds the terms; the installments hold the schedule those terms
 * worked out to. Once approved, the schedule is the authority — editing a rate
 * afterwards is not a thing that can happen, because the only way to change an
 * approved loan is to cancel it and write a new one.
 */
class StaffLoan extends Model
{
    use HasUuids;

    /** Encoded, waiting for finance or an administrator to sign it off. */
    public const STATUS_PENDING = 'pending';

    /** Signed off. Payroll collects it from here on. */
    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    /** Called off part-way through. The unpaid tail is never collected. */
    public const STATUS_CANCELLED = 'cancelled';

    /** Every installment collected. */
    public const STATUS_COMPLETED = 'completed';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
        self::STATUS_CANCELLED,
        self::STATUS_COMPLETED,
    ];

    /** No interest at all — the school is lending, not earning. */
    public const INTEREST_NONE = 'none';

    /**
     * Flat interest charged on the whole principal for the whole term, then
     * split evenly. ₱6,000 at 1% a month over 12 months is ₱720 of interest
     * however fast it is paid down.
     */
    public const INTEREST_ADD_ON = 'add_on';

    /**
     * Interest charged each month on what is still owed, with a level monthly
     * payment. Cheaper for the borrower, and the split between principal and
     * interest shifts every month.
     */
    public const INTEREST_DIMINISHING = 'diminishing';

    public const INTEREST_METHODS = [
        self::INTEREST_NONE,
        self::INTEREST_ADD_ON,
        self::INTEREST_DIMINISHING,
    ];

    public const RATE_MONTHLY = 'monthly';

    public const RATE_ANNUAL = 'annual';

    public const RATE_PERIODS = [self::RATE_MONTHLY, self::RATE_ANNUAL];

    protected $fillable = [
        'institution_id',
        'user_id',
        'reference_no',
        'purpose',
        'principal_amount',
        'interest_method',
        'interest_rate_percent',
        'rate_period',
        'term_months',
        'interest_amount',
        'total_payable',
        'installment_amount',
        'amount_paid',
        'first_deduction_date',
        'status',
        'requested_by',
        'reviewed_by',
        'reviewed_at',
        'review_note',
        'completed_at',
    ];

    protected $casts = [
        'principal_amount' => 'decimal:2',
        'interest_rate_percent' => 'decimal:3',
        'term_months' => 'integer',
        'interest_amount' => 'decimal:2',
        'total_payable' => 'decimal:2',
        'installment_amount' => 'decimal:2',
        'amount_paid' => 'decimal:2',
        'first_deduction_date' => 'date',
        'reviewed_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    /** Approved and still owed something — the only state payroll collects in. */
    public function isCollectable(): bool
    {
        return $this->status === self::STATUS_APPROVED;
    }

    /** What is still owed, never below zero. */
    public function balance(): float
    {
        return round(max(0, (float) $this->total_payable - (float) $this->amount_paid), 2);
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    /** The borrower. */
    public function staff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Who encoded the loan — the answer to "who put this on my payslip?". */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    /** Who approved or rejected it. */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function installments(): HasMany
    {
        return $this->hasMany(StaffLoanInstallment::class)->orderBy('sequence');
    }

    public function events(): HasMany
    {
        return $this->hasMany(StaffLoanEvent::class)->orderBy('created_at');
    }
}
