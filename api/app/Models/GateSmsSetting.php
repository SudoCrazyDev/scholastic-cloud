<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-gate SMS notification config. One row per (institution, gate_type),
 * where gate_type mirrors rfid_scan_logs.type — 'enter' or 'exit'.
 */
class GateSmsSetting extends Model
{
    use HasFactory, HasUuids;

    public const GATE_TYPES = ['enter', 'exit'];

    /**
     * Minutes after a tap past which a notification is dropped rather than sent.
     * Matters from the moment kiosks upload backlogs — see GateSmsNotifier.
     */
    public const DEFAULT_LATE_THRESHOLD_MINUTES = 15;

    protected $fillable = [
        'institution_id',
        'gate_type',
        'is_enabled',
        'sms_gateway_id',
        'message_template',
        'cooldown_minutes',
        'late_threshold_minutes',
        'timezone',
    ];

    protected $casts = [
        'is_enabled' => 'boolean',
        'cooldown_minutes' => 'integer',
        'late_threshold_minutes' => 'integer',
    ];

    /**
     * Mirrors the column defaults so a row created via firstOrCreate() is fully
     * populated in memory — otherwise the first GET would omit these keys.
     */
    protected $attributes = [
        'is_enabled' => false,
        'cooldown_minutes' => 0,
        'late_threshold_minutes' => self::DEFAULT_LATE_THRESHOLD_MINUTES,
        'timezone' => 'Asia/Manila',
    ];

    public static function defaultTemplate(string $gateType): string
    {
        return $gateType === 'exit'
            ? 'Good day! {student_name} has EXITED {school} at {time} on {date}.'
            : 'Good day! {student_name} has ENTERED {school} at {time} on {date}.';
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function smsGateway(): BelongsTo
    {
        return $this->belongsTo(SmsGateway::class, 'sms_gateway_id');
    }
}
