<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StudentDiscount extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'student_id',
        'school_fee_id',
        'academic_year',
        'discount_type',
        'value',
        'description',
        'created_by',
    ];

    protected $casts = [
        'value' => 'decimal:2',
    ];

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function schoolFee()
    {
        return $this->belongsTo(SchoolFee::class);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
