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
} 