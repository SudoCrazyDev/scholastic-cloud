<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StudentProfile extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'student_id',
        'complete_address',
        'mobile_number',
        'place_of_birth',
        'mother_tongue',
        'last_school_attended',
        'school_year',
        'school_address',
        'brothers_count',
        'sisters_count',
    ];

    protected $casts = [
        'brothers_count' => 'integer',
        'sisters_count' => 'integer',
    ];

    public function student()
    {
        return $this->belongsTo(Student::class);
    }
}
