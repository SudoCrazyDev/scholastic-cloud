<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StudentFee extends Model
{
    use HasFactory, HasUuids;

    /** Collected on its own, outside the payment plan. The default. */
    public const BILLING_CASH = 'cash';

    /** Joins the principal the payment plan splits across installments. */
    public const BILLING_INSTALLMENT = 'installment';

    public const BILLING_TYPES = [self::BILLING_CASH, self::BILLING_INSTALLMENT];

    protected $fillable = [
        'institution_id',
        'name',
        'amount',
        'billing_type',
        'description',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
