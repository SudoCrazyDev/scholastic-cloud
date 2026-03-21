<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Support\Facades\Storage;

class StudentDocument extends Model
{
    use HasUuids;

    protected $fillable = [
        'student_id',
        'institution_id',
        'document_type',
        'file_path',
        'file_name',
        'mime_type',
        'uploaded_by',
    ];

    public function student()
    {
        return $this->belongsTo(Student::class);
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

    protected $appends = ['url'];
}
