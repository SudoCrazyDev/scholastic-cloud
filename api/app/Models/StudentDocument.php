<?php

namespace App\Models;

use App\Support\MediaUrl;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

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
        if (! $this->file_path) {
            return null;
        }

        return MediaUrl::for($this->file_path);
    }

    protected $appends = ['url'];
}
