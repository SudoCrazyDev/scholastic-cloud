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
        'days_worked',
        'hours_worked',
        'gross_pay',
        'sss_employee',
        'pagibig_employee',
        'philhealth_employee',
        'advance',
        'other_deductions',
        'other_deductions_note',
        'sss_employer',
        'pagibig_employer',
        'philhealth_employer',
        'total_deductions',
        'net_pay',
    ];

    protected $casts = [
        'daily_rate' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'hours_per_day' => 'decimal:2',
        'days_worked' => 'decimal:2',
        'hours_worked' => 'decimal:2',
        'gross_pay' => 'decimal:2',
        'sss_employee' => 'decimal:2',
        'pagibig_employee' => 'decimal:2',
        'philhealth_employee' => 'decimal:2',
        'advance' => 'decimal:2',
        'other_deductions' => 'decimal:2',
        'sss_employer' => 'decimal:2',
        'pagibig_employer' => 'decimal:2',
        'philhealth_employer' => 'decimal:2',
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
}
