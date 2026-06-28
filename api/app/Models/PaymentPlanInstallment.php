<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentPlanInstallment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'payment_plan_id',
        'sequence',
        'label',
        'due_month',
        'due_day',
        'grace_period_days',
        'late_fee_percentage',
        'share_percentage',
    ];

    protected $casts = [
        'sequence' => 'integer',
        'due_month' => 'integer',
        'due_day' => 'integer',
        'grace_period_days' => 'integer',
        'late_fee_percentage' => 'float',
        'share_percentage' => 'float',
    ];

    public function paymentPlan()
    {
        return $this->belongsTo(PaymentPlan::class);
    }
}
