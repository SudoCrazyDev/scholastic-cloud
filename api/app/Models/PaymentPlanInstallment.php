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
        'share_percentage',
    ];

    protected $casts = [
        'sequence' => 'integer',
        'due_month' => 'integer',
        'due_day' => 'integer',
        'share_percentage' => 'float',
    ];

    public function paymentPlan()
    {
        return $this->belongsTo(PaymentPlan::class);
    }
}
