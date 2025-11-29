<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StudentAttendance extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'student_id',
        'class_section_id',
        'academic_year',
        'month',
        'year',
        'days_present',
        'days_absent',
    ];

    protected $casts = [
        'month' => 'integer',
        'year' => 'integer',
        'days_present' => 'integer',
        'days_absent' => 'integer',
    ];

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function classSection()
    {
        return $this->belongsTo(ClassSection::class);
    }
}

