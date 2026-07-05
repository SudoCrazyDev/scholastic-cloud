<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayslipDay extends Model
{
    use HasUuids;

    protected $fillable = [
        'payslip_id',
        'work_date',
        'time_in',
        'time_out',
        'lunch_start',
        'lunch_end',
        'required_hours',
        'hours_worked',
        'amount_earned',
        'is_holiday',
        'is_rest_day',
    ];

    protected $casts = [
        'work_date' => 'date',
        'required_hours' => 'decimal:2',
        'hours_worked' => 'decimal:2',
        'amount_earned' => 'decimal:2',
        'is_holiday' => 'boolean',
        'is_rest_day' => 'boolean',
    ];

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(Payslip::class);
    }
}
