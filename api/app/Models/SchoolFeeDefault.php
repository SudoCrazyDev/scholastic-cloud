<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class SchoolFeeDefault extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'school_fee_id',
        'institution_id',
        'grade_level',
        'academic_year',
        'amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function schoolFee()
    {
        return $this->belongsTo(SchoolFee::class);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }
}
