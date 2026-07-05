<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollCompensation extends Model
{
    use HasUuids;

    // "compensation" is uncountable, so Eloquent would guess `payroll_compensation`.
    protected $table = 'payroll_compensations';

    protected $fillable = [
        'institution_id',
        'user_id',
        'designation',
        'daily_rate',
        'hourly_rate',
        'hours_per_day',
        'sss_employer',
        'pagibig_employer',
        'philhealth_employer',
        'created_by',
    ];

    protected $casts = [
        'daily_rate' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'hours_per_day' => 'decimal:2',
        'sss_employer' => 'decimal:2',
        'pagibig_employer' => 'decimal:2',
        'philhealth_employer' => 'decimal:2',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function deductions(): HasMany
    {
        return $this->hasMany(PayrollCompensationDeduction::class, 'payroll_compensation_id');
    }

    /**
     * Hourly rate falls back to daily_rate / hours_per_day when not set.
     */
    public function effectiveHourlyRate(): float
    {
        if ($this->hourly_rate !== null && (float) $this->hourly_rate > 0) {
            return (float) $this->hourly_rate;
        }

        $hoursPerDay = (float) $this->hours_per_day ?: 8.0;

        return round((float) $this->daily_rate / $hoursPerDay, 2);
    }
}
