<?php

namespace App\Models;

use App\Support\MediaUrl;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DisbursementReceipt extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'disbursement_id',
        'path',
        'name',
        'mime',
    ];

    protected $appends = ['url'];

    public function disbursement()
    {
        return $this->belongsTo(Disbursement::class);
    }

    public function getUrlAttribute(): ?string
    {
        if (! $this->path) {
            return null;
        }

        return MediaUrl::for($this->path);
    }
}
