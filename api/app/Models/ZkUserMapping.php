<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ZkUserMapping extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'device_id',
        'zk_user_id',
        'zk_name',
        'zk_card_no',
        'zk_privilege',
        'user_id',
        'last_synced_at',
        'push_status',
        'push_action',
        'push_error',
        'push_queued_at',
    ];

    protected $casts = [
        'last_synced_at'  => 'datetime',
        'push_queued_at'  => 'datetime',
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
