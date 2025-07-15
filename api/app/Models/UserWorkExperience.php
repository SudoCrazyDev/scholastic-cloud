<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserWorkExperience extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'user_work_experience';

    protected $fillable = [
        'user_id',
        'work_details',
    ];

    protected $casts = [
        'work_details' => 'array',
    ];
} 