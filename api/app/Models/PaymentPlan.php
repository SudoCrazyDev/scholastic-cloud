<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentPlan extends Model
{
    use HasFactory, HasUuids;

    /** Payments received before the schedule starts settle installments earliest-first. */
    public const ADVANCE_EQUAL_SPLIT = 'equal_split';

    /** Payments received before the schedule starts are a downpayment: they shrink every installment. */
    public const ADVANCE_NET_OF_DOWNPAYMENT = 'net_of_downpayment';

    public const ADVANCE_PAYMENT_MODES = [
        self::ADVANCE_EQUAL_SPLIT,
        self::ADVANCE_NET_OF_DOWNPAYMENT,
    ];

    protected $fillable = [
        'institution_id',
        'name',
        'description',
        'advance_payment_mode',
        'is_active',
        'sort_order',
        'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function deductsDownpayment(): bool
    {
        return $this->advance_payment_mode === self::ADVANCE_NET_OF_DOWNPAYMENT;
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function installments()
    {
        return $this->hasMany(PaymentPlanInstallment::class)->orderBy('sequence');
    }

    public function studentSelections()
    {
        return $this->hasMany(StudentPaymentPlan::class);
    }
}
