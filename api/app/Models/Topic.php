<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class Topic extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'subject_id',
        'quarter',
        'title',
        'description',
        'content',
        'learning_objectives',
        'estimated_minutes',
        'order',
        'is_completed',
        'is_published',
    ];

    protected $casts = [
        'content' => 'array',
        'learning_objectives' => 'array',
        'estimated_minutes' => 'integer',
        'is_completed' => 'boolean',
        'is_published' => 'boolean',
        'order' => 'integer',
    ];

    /**
     * Get the subject that owns the topic.
     */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    /**
     * Per-student progress through this lesson.
     */
    public function progress(): HasMany
    {
        return $this->hasMany(StudentLessonProgress::class);
    }

    /**
     * Content blocks with file URLs re-signed at read time. The `url` stored in
     * a file block is a presigned URL that expires (R2/S3 signatures last at
     * most 7 days), so readers must always get a fresh URL derived from `path`.
     */
    public function contentWithFreshUrls(): array
    {
        $blocks = is_array($this->content) ? $this->content : [];

        return array_map(function ($block) {
            if (($block['type'] ?? null) === 'file' && !empty($block['path'])) {
                $block['url'] = self::freshFileUrl($block['path']) ?? ($block['url'] ?? null);
            }
            return $block;
        }, $blocks);
    }

    /**
     * Best-effort viewable URL for an R2 object: presigned if supported, else public URL.
     */
    public static function freshFileUrl(string $path): ?string
    {
        try {
            return Storage::disk('r2')->temporaryUrl($path, now()->addDays(7));
        } catch (\Throwable) {
            try {
                return Storage::disk('r2')->url($path);
            } catch (\Throwable) {
                return null;
            }
        }
    }
}
