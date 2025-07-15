<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserAddress extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'user_addresses';

    protected $fillable = [
        'user_id',
        'house_no',
        'street',
        'subdivision',
        'barangay',
        'city',
        'province',
        'zip_code',
        'permanent_house_no',
        'permanent_street',
        'permanent_subdivision',
        'permanent_barangay',
        'permanent_city',
        'permanent_province',
        'permanent_zip_code',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
} 