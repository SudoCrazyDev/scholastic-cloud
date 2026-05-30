<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendanceLog extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'device_id',
        'zk_user_id',
        'user_id',
        'punched_at',
        'punch_type_code',
        'punch_type',
        'verify_type',
    ];

    protected $casts = [
        'punched_at' => 'datetime',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(BiometricDevice::class, 'device_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
