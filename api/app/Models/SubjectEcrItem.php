<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SubjectEcrItem extends Model
{
    use HasUuids;
    
    protected $fillable = [
        'subject_ecr_id',
        'type',
        'title',
        'description',
        'score',
    ];

    protected $casts = [
        'score' => 'decimal:2',
    ];
}