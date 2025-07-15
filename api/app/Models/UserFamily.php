<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserFamily extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'user_family';

    protected $fillable = [
        'user_id',
        'spouse_first_name',
        'spouse_middle_name',
        'spouse_last_name',
        'spouse_extension_name',
        'spouse_occupation',
        'spouse_employer',
        'spouse_business_address',
        'spouse_telephone',
        'father_first_name',
        'father_middle_name',
        'father_last_name',
        'father_extension_name',
        'mother_first_name',
        'mother_middle_name',
        'mother_last_name',
        'mother_extension',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
} 