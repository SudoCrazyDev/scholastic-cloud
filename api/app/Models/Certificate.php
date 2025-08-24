<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Certificate extends Model
{
    use HasFactory;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'title',
        'design_json',
        'institution_id',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'design_json' => 'array',
    ];
}