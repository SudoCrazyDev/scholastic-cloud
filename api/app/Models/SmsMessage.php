<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SmsMessage extends Model
{
    use HasFactory, HasUuids;

    /**
     * Written by the reaper (SmsService::reapStuck) onto rows a gateway claimed but
     * never reported on. Doubles as the marker that lets a late, genuine result from
     * the agent still correct the row — see SmsBridgeController::outboxStatus.
     */
    public const REAPED_ERROR = 'No result reported by gateway';

    protected $fillable = [
        'institution_id',
        'gateway_id',
        'direction',
        'to_number',
        'from_number',
        'body',
        'status',
        'segments',
        'error',
        'provider_ref',
        'source',
        'source_type',
        'source_id',
        'queued_by',
        'scheduled_at',
        'sent_at',
        'delivered_at',
        'received_at',
    ];

    protected $casts = [
        'segments' => 'integer',
        'scheduled_at' => 'datetime',
        'sent_at' => 'datetime',
        'delivered_at' => 'datetime',
        'received_at' => 'datetime',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function gateway(): BelongsTo
    {
        return $this->belongsTo(SmsGateway::class, 'gateway_id');
    }
}
