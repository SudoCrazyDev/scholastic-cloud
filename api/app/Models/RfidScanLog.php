<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class RfidScanLog extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'student_rfid_tag_id',
        'student_id',
        'institution_id',
        'scanned_at',
        'type',
        'device_name',
    ];

    protected $casts = [
        'scanned_at' => 'datetime',
    ];

    public function studentRfidTag()
    {
        return $this->belongsTo(StudentRfidTag::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }
}
