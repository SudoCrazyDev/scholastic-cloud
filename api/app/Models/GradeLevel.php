<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GradeLevel extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'title',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];
}
