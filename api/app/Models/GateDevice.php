<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A paired gate kiosk. Mirrors SmsGateway: the token is the identity, and the
 * institution + gate direction come from this row rather than from a URL.
 */
class GateDevice extends Model
{
    use HasFactory, HasUuids;

    /**
     * How often a kiosk is expected to check in, and how long silence is
     * tolerated before it reads as offline.
     *
     * Deliberately looser than the SMS agent's 150s. A gate kiosk on a slow
     * link is *expected* to go quiet — that is the whole point of the offline
     * mode — so a short window would show every kiosk flapping between online
     * and offline all morning and teach admins to ignore the column.
     */
    public const HEARTBEAT_SECONDS = 120;

    public const OFFLINE_AFTER_SECONDS = 420;

    protected $fillable = [
        'institution_id',
        'name',
        'location',
        'gate_type',
        'device_token_hash',
        'pairing_code',
        'pairing_code_expires_at',
        'last_seen_at',
        'last_sync_at',
        'roster_count',
        'pending_count',
        'clock_offset_ms',
        'app_version',
    ];

    /**
     * Never serialize the credential or the code that mints one. The pairing
     * code is returned explicitly by the two endpoints that issue it.
     */
    protected $hidden = [
        'device_token_hash',
        'pairing_code',
    ];

    protected $casts = [
        'pairing_code_expires_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'last_sync_at' => 'datetime',
        'roster_count' => 'integer',
        'pending_count' => 'integer',
        'clock_offset_ms' => 'integer',
    ];

    public function getIsPairedAttribute(): bool
    {
        return $this->device_token_hash !== null;
    }

    public function getIsOnlineAttribute(): bool
    {
        return $this->last_seen_at !== null
            && $this->last_seen_at->diffInSeconds(now()) <= self::OFFLINE_AFTER_SECONDS;
    }

    public function getComputedStatusAttribute(): string
    {
        if ($this->last_seen_at === null) {
            return 'unknown';
        }

        return $this->is_online ? 'online' : 'offline';
    }

    /**
     * True when the device's own clock is far enough out that timestamps it
     * stamps on queued scans cannot be trusted. One minute is generous for a
     * gate: attendance is read to the minute, and NTP normally holds a device
     * inside a second.
     */
    public function getClockSuspectAttribute(): bool
    {
        return $this->clock_offset_ms !== null && abs($this->clock_offset_ms) > 60_000;
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }
}
