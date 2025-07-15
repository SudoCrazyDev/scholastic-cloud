<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserChildren extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'user_childrens';

    protected $fillable = [
        'user_id',
        'children_name',
        'date_of_birth',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected $casts = [
        'date_of_birth' => 'date',
    ];
} 