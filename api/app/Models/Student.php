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

    public function sections()
    {
        return $this->belongsToMany(ClassSection::class, 'student_sections', 'student_id', 'section_id')
            ->withPivot('academic_year', 'is_active', 'is_promoted')
            ->withTimestamps();
    }

    public function studentSections()
    {
        return $this->hasMany(StudentSection::class);
    }

    /**
     * Subjects the student is explicitly assigned to.
     */
    public function subjects()
    {
        return $this->belongsToMany(Subject::class, 'student_subjects', 'student_id', 'subject_id')
            ->withTimestamps();
    }

    /**
     * Pivot records for subject assignments.
     */
    public function studentSubjects()
    {
        return $this->hasMany(StudentSubject::class, 'student_id');
    }

    /**
     * Get the ECR item scores for the student.
     */
    public function ecrItemScores()
    {
        return $this->hasMany(StudentEcrItemScore::class);
    }
} 