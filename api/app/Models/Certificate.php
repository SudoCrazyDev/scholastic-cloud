<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Certificate extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'title',
        'design_json',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'design_json' => 'array',
    ];
}