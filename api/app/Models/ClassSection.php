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
        'department_id',
        'track_id',
        'strand_id',
        'grade_level',
        'title',
        'adviser',
        'academic_year',
        'status',
        'deleted_at',
    ];

    /**
     * Get the adviser (user) for this class section.
     */
    public function adviserUser()
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
     * Get the department for this class section (null means use institution default).
     */
    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function track()
    {
        return $this->belongsTo(Track::class);
    }

    public function strand()
    {
        return $this->belongsTo(Strand::class);
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