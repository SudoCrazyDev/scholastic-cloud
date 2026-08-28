<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A card that tapped at a gate and could not be matched to a student.
 *
 * One row per card per school — see the migration for why this is a worklist
 * rather than a log.
 */
class GateUnresolvedScan extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'gate_device_id',
        'rfid_uid',
        'type',
        'device_name',
        'attempts',
        'first_seen_at',
        'last_seen_at',
        'clock_suspect',
    ];

    protected $casts = [
        'attempts' => 'integer',
        'first_seen_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'clock_suspect' => 'boolean',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(GateDevice::class, 'gate_device_id');
    }

    /**
     * Note a tap nobody could place, or add to one already noted.
     *
     * Never throws: this is diagnostics hanging off the ingest loop, and a scan
     * upload must not fail because the worklist could not be written.
     */
    public static function note(array $attributes): void
    {
        try {
            $existing = static::where('institution_id', $attributes['institution_id'])
                ->where('rfid_uid', $attributes['rfid_uid'])
                ->first();

            if (! $existing) {
                static::create($attributes + [
                    'attempts' => 1,
                    'first_seen_at' => $attributes['last_seen_at'],
                ]);

                return;
            }

            $existing->update([
                'attempts' => $existing->attempts + 1,
                // A backlog uploads oldest-first, but a device with a bad clock
                // can send a tap older than one already recorded; keep the
                // latest either way.
                'last_seen_at' => $attributes['last_seen_at']->greaterThan($existing->last_seen_at)
                    ? $attributes['last_seen_at']
                    : $existing->last_seen_at,
                'first_seen_at' => $attributes['last_seen_at']->lessThan($existing->first_seen_at)
                    ? $attributes['last_seen_at']
                    : $existing->first_seen_at,
                'type' => $attributes['type'],
                'device_name' => $attributes['device_name'],
                'gate_device_id' => $attributes['gate_device_id'],
                'clock_suspect' => $attributes['clock_suspect'] || $existing->clock_suspect,
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Could not note an unresolved gate scan', [
                'rfid_uid' => $attributes['rfid_uid'] ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
