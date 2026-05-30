<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BiometricDevice extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'name',
        'serial_number',
        'mac_address',
        'comm_key',
        'last_seen_at',
        'status',
        'bridge_token_hash',
        'pairing_code',
        'pairing_code_expires_at',
        'firmware_version',
    ];

    protected $hidden = [
        'bridge_token_hash',
        'comm_key',
        'pairing_code',
    ];

    protected $casts = [
        'last_seen_at' => 'datetime',
        'pairing_code_expires_at' => 'datetime',
    ];

    // Online if a heartbeat was received within the last 150 seconds (2.5x the 60s interval)
    public function getIsOnlineAttribute(): bool
    {
        return $this->last_seen_at !== null
            && $this->last_seen_at->diffInSeconds(now()) <= 150;
    }

    public function getComputedStatusAttribute(): string
    {
        if ($this->last_seen_at === null) {
            return 'unknown';
        }
        return $this->is_online ? 'online' : 'offline';
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function zkUserMappings(): HasMany
    {
        return $this->hasMany(ZkUserMapping::class, 'device_id');
    }
}
