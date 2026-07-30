<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollPeriod extends Model
{
    use HasUuids;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_FINALIZED = 'finalized';

    /** Every employee with a compensation rate is paid on this period. */
    public const SCOPE_ALL = 'all';

    /** Only employees assigned to the period's staff schedules are paid. */
    public const SCOPE_SCHEDULES = 'schedules';

    protected $fillable = [
        'institution_id',
        'name',
        'date_from',
        'date_to',
        'schedule_scope',
        'status',
        'paid_on',
        'created_by',
    ];

    protected $casts = [
        'date_from' => 'date',
        'date_to' => 'date',
        'paid_on' => 'date',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function payslips(): HasMany
    {
        return $this->hasMany(Payslip::class);
    }

    /**
     * The staff schedules this period covers. Only meaningful while
     * schedule_scope is 'schedules'; ignored when the scope is 'all'.
     */
    public function staffSchedules(): BelongsToMany
    {
        return $this->belongsToMany(
            StaffSchedule::class,
            'payroll_period_staff_schedules',
            'payroll_period_id',
            'staff_schedule_id'
        )->using(PayrollPeriodStaffSchedule::class)->withTimestamps();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isFinalized(): bool
    {
        return $this->status === self::STATUS_FINALIZED;
    }

    public function coversAllSchedules(): bool
    {
        return $this->schedule_scope !== self::SCOPE_SCHEDULES;
    }
}
