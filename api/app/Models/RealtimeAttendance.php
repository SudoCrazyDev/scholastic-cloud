<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RealtimeAttendance extends Model
{
    use HasFactory;
    
    protected $table = 'realtime_attendance';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = [
        'id',
        'auth_date_time',
        'auth_date',
        'auth_time',
        'direction',
        'device_name',
        'device_serial_no',
        'person_name',
        'card_no',
    ];
} 