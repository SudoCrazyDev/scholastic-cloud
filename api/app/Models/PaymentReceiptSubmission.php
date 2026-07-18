<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class PaymentReceiptSubmission extends Model
{
    use HasFactory, HasUuids;

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'institution_id',
        'student_id',
        'academic_year',
        'installment_sequence',
        'installment_label',
        'amount',
        'file_path',
        'file_name',
        'mime_type',
        'status',
        'review_note',
        'reviewed_by',
        'reviewed_at',
        'student_payment_id',
    ];

    protected $casts = [
        'installment_sequence' => 'integer',
        'amount' => 'decimal:2',
        'reviewed_at' => 'datetime',
    ];

    protected $appends = ['url'];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function studentPayment()
    {
        return $this->belongsTo(StudentPayment::class);
    }

    public function getUrlAttribute(): ?string
    {
        if (!$this->file_path) {
            return null;
        }

        try {
            $r2Url = config('filesystems.disks.r2.url');
            if ($r2Url) {
                return rtrim($r2Url, '/') . '/' . ltrim($this->file_path, '/');
            }
            return Storage::disk('r2')->temporaryUrl($this->file_path, now()->addHours(24));
        } catch (\Throwable $e) {
            return null;
        }
    }
}
