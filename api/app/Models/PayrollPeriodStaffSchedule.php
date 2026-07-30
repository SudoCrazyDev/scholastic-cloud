<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\Pivot;

class PayrollPeriodStaffSchedule extends Pivot
{
    use HasUuids;

    protected $table = 'payroll_period_staff_schedules';

    public $incrementing = false;

    protected $keyType = 'string';
}
