<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class DeviceCommand extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'device_id',
        'cmd_id',
        'command_type',
        'payload',
        'status',
        'device_response',
        'sent_at',
        'completed_at',
    ];

    protected $casts = [
        'sent_at'      => 'datetime',
        'completed_at' => 'datetime',
    ];

    public static function buildAddUserPayload(string $pin, string $name, string $password = '0000'): string
    {
        $fields = [
            "PIN={$pin}",
            "Name={$name}",
            "Password={$password}",
            "Privilege=0",
            "Enable=1",
            "CardNo=0",
            "FaceCount=0",
            "FingerCount=0",
        ];
        return 'DATA UPDATE USERINFO ' . implode("\t", $fields);
    }

    public static function buildDeleteUserPayload(string $pin): string
    {
        return "DATA DELETE USERINFO PIN={$pin}";
    }

    public static function generateCmdId(): string
    {
        return (string) random_int(100000, 999999);
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(BiometricDevice::class, 'device_id');
    }
}
