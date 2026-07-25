<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SmsSetting extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'default_gateway_id',
        'rate_limit_per_minute',
        'send_window_start',
        'send_window_end',
        'opt_out_keywords',
        'sender_name',
    ];

    protected $casts = [
        'rate_limit_per_minute' => 'integer',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function defaultGateway(): BelongsTo
    {
        return $this->belongsTo(SmsGateway::class, 'default_gateway_id');
    }
}
