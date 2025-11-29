<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class SchoolDay extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'institution_id',
        'academic_year',
        'month',
        'year',
        'total_days',
    ];

    protected $casts = [
        'month' => 'integer',
        'year' => 'integer',
        'total_days' => 'integer',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }
}

