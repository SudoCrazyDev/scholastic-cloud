<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class StudentAdditionalFee extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    /** Added by hand from the Ledger view. */
    public const SOURCE_MANUAL = 'manual';

    /** Materialized by LateFeeService when a payment-plan installment went overdue. */
    public const SOURCE_LATE_FEE = 'late_fee';

    /** Collected on its own, outside the payment plan. The default. */
    public const BILLING_CASH = 'cash';

    /** Joins the principal the payment plan splits across installments. */
    public const BILLING_INSTALLMENT = 'installment';

    public const BILLING_TYPES = [self::BILLING_CASH, self::BILLING_INSTALLMENT];

    protected $fillable = [
        'institution_id',
        'student_id',
        'student_fee_id',
        'academic_year',
        'name',
        'description',
        'billing_type',
        'source',
        'installment_sequence',
        'late_fee_percentage',
        'base_amount',
        'amount',
        'created_by',
        'deleted_by',
        'waive_note',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'base_amount' => 'decimal:2',
        'late_fee_percentage' => 'float',
        'installment_sequence' => 'integer',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Who waived the charge. Set alongside `deleted_at`, cleared when it is restored. */
    public function waivedBy()
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    /** The reusable student fee this charge was picked from, when it was not typed by hand. */
    public function studentFee()
    {
        return $this->belongsTo(StudentFee::class);
    }

    public function payments()
    {
        return $this->hasMany(StudentPayment::class, 'student_additional_fee_id');
    }

    public function isLateFee(): bool
    {
        return $this->source === self::SOURCE_LATE_FEE;
    }

    /**
     * Whether this charge feeds the principal the payment plan splits.
     *
     * A late fee never does — it is charged against one installment and collected with
     * it, so folding it back into the split would compound it across every period.
     */
    public function isInstallmentBased(): bool
    {
        return ! $this->isLateFee() && $this->billing_type === self::BILLING_INSTALLMENT;
    }

    /** A charge collected on its own, outside the schedule. */
    public function isCashBasis(): bool
    {
        return ! $this->isLateFee() && ! $this->isInstallmentBased();
    }

    public function scopeLateFees($query)
    {
        return $query->where('source', self::SOURCE_LATE_FEE);
    }
}
