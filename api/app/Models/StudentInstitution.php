<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StudentInstitution extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_id',
        'institution_id',
        'is_active',
        'academic_year',
    ];

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }
} 