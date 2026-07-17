<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffScheduleDay extends Model
{
    use HasFactory, HasUuids;

    public const DAYS = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
    ];

    protected $fillable = [
        'staff_schedule_id',
        'day_of_week',
        'start_time',
        'grace_minutes',
        'end_time',
        'lunch_start',
        'lunch_end',
    ];

    protected $casts = [
        'grace_minutes' => 'integer',
    ];

    public function staffSchedule()
    {
        return $this->belongsTo(StaffSchedule::class);
    }

    /**
     * SQL fragment that orders weekday rows Monday → Sunday rather than alphabetically.
     */
    public static function dayOrderSql(): string
    {
        $cases = [];
        foreach (self::DAYS as $index => $day) {
            $cases[] = "WHEN '{$day}' THEN {$index}";
        }

        return 'CASE day_of_week '.implode(' ', $cases).' ELSE 7 END';
    }
}
