<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentRunningGrade extends Model
{
    use HasUuids;
    
    protected $fillable = [
        'student_id',
        'subject_id',
        'quarter',
        'grade',
        'final_grade',
        'academic_year',
    ];

    protected $casts = [
        'grade' => 'decimal:2',
        'final_grade' => 'decimal:2',
    ];

    /**
     * Get the student that owns the running grade.
     */
    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    /**
     * Get the subject that owns the running grade.
     */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    /**
     * Check if this grade is for a parent subject
     */
    public function isParentSubjectGrade(): bool
    {
        return $this->subject && $this->subject->isParentSubject();
    }

    /**
     * Check if this grade is for a child subject
     */
    public function isChildSubjectGrade(): bool
    {
        return $this->subject && $this->subject->isChildSubject();
    }

    /**
     * Get the calculated grade for a parent subject based on its child subjects
     * This is useful for display purposes
     */
    public function getCalculatedParentGrade(): ?float
    {
        if (!$this->isParentSubjectGrade()) {
            return null;
        }

        $childSubjects = $this->subject->childSubjects;
        if ($childSubjects->isEmpty()) {
            return null;
        }

        $childSubjectIds = $childSubjects->pluck('id');
        
        $childGrades = static::where('student_id', $this->student_id)
            ->whereIn('subject_id', $childSubjectIds)
            ->where('quarter', $this->quarter)
            ->where('academic_year', $this->academic_year)
            ->whereNotNull('final_grade')
            ->get();

        if ($childGrades->isEmpty()) {
            return null;
        }

        $totalGrade = $childGrades->sum('final_grade');
        return round($totalGrade / $childGrades->count(), 2);
    }
} 