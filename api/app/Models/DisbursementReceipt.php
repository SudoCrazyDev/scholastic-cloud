<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

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

        try {
            $r2Url = config('filesystems.disks.r2.url');
            if ($r2Url) {
                return rtrim($r2Url, '/') . '/' . ltrim($this->path, '/');
            }
            return Storage::disk('r2')->temporaryUrl($this->path, now()->addHours(24));
        } catch (\Throwable $e) {
            return null;
        }
    }
}
