<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffCalendarEvent extends Model
{
    use HasFactory, HasUuids;

    public const TYPES = ['holiday', 'event', 'suspension'];

    /** Day pays out exactly what the hours/penalties say (legacy behaviour). */
    public const PAY_NORMAL = 'normal';

    /** Day pays the full daily rate for everyone, punches or not. */
    public const PAY_FULL_DAY = 'full_day_paid';

    /** Day pays nothing (unpaid suspension). */
    public const PAY_NO_PAY = 'no_pay';

    public const PAY_TREATMENTS = [self::PAY_NORMAL, self::PAY_FULL_DAY, self::PAY_NO_PAY];

    protected $fillable = [
        'institution_id',
        'title',
        'description',
        'type',
        'pay_treatment',
        'dismissal_time',
        'event_date',
        'created_by',
    ];

    protected $casts = [
        'event_date' => 'date',
    ];

    /**
     * Whether this entry changes how payroll prices the day. Plain `event`
     * rows are informational and never do.
     */
    public function affectsPay(): bool
    {
        return $this->pay_treatment !== self::PAY_NORMAL || $this->dismissal_time !== null;
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
