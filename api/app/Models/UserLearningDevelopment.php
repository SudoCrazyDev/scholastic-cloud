<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserLearningDevelopment extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'user_learning_development';

    protected $fillable = [
        'user_id',
        'development_details',
    ];

    protected $casts = [
        'development_details' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
} 