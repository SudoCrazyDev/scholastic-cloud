<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffScheduleAssignment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'staff_schedule_id',
        'user_id',
        'created_by',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function staffSchedule()
    {
        return $this->belongsTo(StaffSchedule::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
