<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Records that a grade-level discount has been voided for a single student.
 * The presence of a row means the discount is suppressed on that student's
 * ledger/NOA while staying active for the rest of the grade.
 */
class GradeLevelDiscountStudentVoid extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'student_id',
        'grade_level_discount_id',
        'academic_year',
        'voided_at',
        'voided_by',
        'void_note',
    ];

    protected $casts = [
        'voided_at' => 'datetime',
    ];

    public function gradeLevelDiscount()
    {
        return $this->belongsTo(GradeLevelDiscount::class);
    }

    public function voidedBy()
    {
        return $this->belongsTo(User::class, 'voided_by');
    }
}
