<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Payslip extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'payroll_period_id',
        'user_id',
        'designation',
        'daily_rate',
        'hourly_rate',
        'hours_per_day',
        'late_penalty_per_minute',
        'undertime_penalty_per_minute',
        'overtime_rate_per_minute',
        'days_worked',
        'hours_worked',
        'late_minutes',
        'undertime_minutes',
        'penalty_total',
        'overtime_minutes',
        'overtime_total',
        'gross_pay',
        'total_deductions',
        'net_pay',
    ];

    protected $casts = [
        'daily_rate' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'hours_per_day' => 'decimal:2',
        'late_penalty_per_minute' => 'decimal:2',
        'undertime_penalty_per_minute' => 'decimal:2',
        'overtime_rate_per_minute' => 'decimal:2',
        'days_worked' => 'decimal:2',
        'hours_worked' => 'decimal:2',
        'late_minutes' => 'integer',
        'undertime_minutes' => 'integer',
        'penalty_total' => 'decimal:2',
        'overtime_minutes' => 'integer',
        'overtime_total' => 'decimal:2',
        'gross_pay' => 'decimal:2',
        'total_deductions' => 'decimal:2',
        'net_pay' => 'decimal:2',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function payrollPeriod(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function days(): HasMany
    {
        return $this->hasMany(PayslipDay::class)->orderBy('work_date');
    }

    public function deductions(): HasMany
    {
        return $this->hasMany(PayslipDeduction::class)->orderBy('created_at');
    }
}
