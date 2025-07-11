<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use App\Models\StudentInstitution;

class Student extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'lrn',
        'first_name',
        'middle_name',
        'last_name',
        'ext_name',
        'gender',
        'religion',
        'birthdate',
        'profile_picture',
        'is_active',
    ];

    public function institutions()
    {
        return $this->belongsToMany(Institution::class, 'student_institutions')
            ->withPivot('is_active', 'academic_year')
            ->withTimestamps();
    }

    public function studentInstitutions()
    {
        return $this->hasMany(StudentInstitution::class);
    }
} 