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

    protected $fillable = [
        'institution_id',
        'student_id',
        'academic_year',
        'name',
        'description',
        'source',
        'installment_sequence',
        'late_fee_percentage',
        'base_amount',
        'amount',
        'created_by',
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

    public function payments()
    {
        return $this->hasMany(StudentPayment::class, 'student_additional_fee_id');
    }

    public function isLateFee(): bool
    {
        return $this->source === self::SOURCE_LATE_FEE;
    }

    public function scopeLateFees($query)
    {
        return $query->where('source', self::SOURCE_LATE_FEE);
    }
}
