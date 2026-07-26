<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayslipDay extends Model
{
    use HasUuids;

    /** Price the day by the usual hours / penalty rules. */
    public const PAY_NORMAL = 'normal';

    /** Guarantee the daily rate regardless of hours worked. */
    public const PAY_FULL_DAY = 'full_day';

    /** The day earns nothing. */
    public const PAY_NO_PAY = 'no_pay';

    protected $fillable = [
        'payslip_id',
        'work_date',
        'time_in',
        'time_out',
        'lunch_start',
        'lunch_end',
        'schedule_start',
        'schedule_end',
        'grace_minutes',
        'waive_late',
        'waive_undertime',
        'pay_policy',
        'exception_label',
        'required_hours',
        'hours_worked',
        'late_minutes',
        'undertime_minutes',
        'penalty_amount',
        'detected_overtime_minutes',
        'overtime_minutes',
        'overtime_amount',
        'amount_earned',
        'is_holiday',
        'is_rest_day',
    ];

    protected $casts = [
        'work_date' => 'date',
        'grace_minutes' => 'integer',
        'waive_late' => 'boolean',
        'waive_undertime' => 'boolean',
        'required_hours' => 'decimal:2',
        'hours_worked' => 'decimal:2',
        'late_minutes' => 'integer',
        'undertime_minutes' => 'integer',
        'penalty_amount' => 'decimal:2',
        'detected_overtime_minutes' => 'integer',
        'overtime_minutes' => 'integer',
        'overtime_amount' => 'decimal:2',
        'amount_earned' => 'decimal:2',
        'is_holiday' => 'boolean',
        'is_rest_day' => 'boolean',
    ];

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(Payslip::class);
    }
}
