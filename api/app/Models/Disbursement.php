<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Disbursement extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'disbursement_type_id',
        'title',
        'description',
        'amount',
        'date_issued',
        'in_charge_user_id',
        'receipt_path',
        'receipt_name',
        'receipt_mime',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'date_issued' => 'date',
    ];

    protected $appends = ['receipt_url'];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function type()
    {
        return $this->belongsTo(DisbursementType::class, 'disbursement_type_id');
    }

    public function inCharge()
    {
        return $this->belongsTo(User::class, 'in_charge_user_id');
    }

    public function getReceiptUrlAttribute(): ?string
    {
        if (! $this->receipt_path) {
            return null;
        }

        try {
            $r2Url = config('filesystems.disks.r2.url');
            if ($r2Url) {
                return rtrim($r2Url, '/') . '/' . ltrim($this->receipt_path, '/');
            }
            return Storage::disk('r2')->temporaryUrl($this->receipt_path, now()->addHours(24));
        } catch (\Throwable $e) {
            return null;
        }
    }
}
