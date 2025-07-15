<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserEducationalBackground extends Model
{
    use HasUuids;

    protected $table = 'user_educational_background';

    protected $fillable = [
        'user_id',
        'educ_details',
    ];

    protected $casts = [
        'educ_details' => 'array',
    ];
} 