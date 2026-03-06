<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GradeLevelDiscount extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'school_fee_id',
        'grade_level',
        'academic_year',
        'discount_type',
        'value',
        'description',
        'created_by',
    ];

    protected $casts = [
        'value' => 'decimal:2',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function schoolFee()
    {
        return $this->belongsTo(SchoolFee::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
