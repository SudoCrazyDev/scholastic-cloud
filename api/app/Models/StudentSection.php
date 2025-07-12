<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StudentSection extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'student_id',
        'section_id',
        'academic_year',
        'is_active',
        'is_promoted',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_promoted' => 'boolean',
    ];

    /**
     * Get the student that belongs to this section.
     */
    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    /**
     * Get the class section that this student belongs to.
     */
    public function classSection()
    {
        return $this->belongsTo(ClassSection::class, 'section_id');
    }
}
