<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserOtherPersonalInfo extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'user_other_personal_info';

    protected $fillable = [
        'user_id',
        'place_of_birth',
        'civil_status',
        'height',
        'weight',
        'blood_type',
        'gsis_id',
        'pag_ibig_id',
        'philhealth_id',
        'sss',
        'tin',
        'agency_employee_id',
        'telephone_no',
        'mobile_no',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
} 