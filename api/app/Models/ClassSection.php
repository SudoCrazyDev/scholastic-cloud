<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class ClassSection extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'grade_level',
        'title',
        'adviser',
        'academic_year',
    ];

    /**
     * Get the adviser (user) for this class section.
     */
    public function adviser()
    {
        return $this->belongsTo(User::class, 'adviser');
    }

    /**
     * Get the institution that owns this class section.
     */
    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    /**
     * Get the students that belong to this class section.
     */
    public function students()
    {
        return $this->belongsToMany(Student::class, 'student_sections', 'section_id', 'student_id')
            ->withPivot('academic_year', 'is_active', 'is_promoted')
            ->withTimestamps();
    }

    /**
     * Get the student sections for this class section.
     */
    public function studentSections()
    {
        return $this->hasMany(StudentSection::class, 'section_id');
    }

    /**
     * Get the subjects that belong to this class section.
     */
    public function subjects()
    {
        return $this->hasMany(Subject::class, 'class_section_id');
    }
} 