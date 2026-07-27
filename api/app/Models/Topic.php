<?php

namespace App\Models;

use App\Support\MediaUrl;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
     * Content blocks with file URLs rebuilt from `path` at read time. URLs are
     * permanent now, but old rows still hold expired presigned links, so the
     * `url` in storage is never trusted — it is always re-derived.
     */
    public function contentWithFreshUrls(): array
    {
        $blocks = is_array($this->content) ? $this->content : [];

        return array_map(function ($block) {
            if (($block['type'] ?? null) === 'file' && ! empty($block['path'])) {
                $block['url'] = self::freshFileUrl($block['path']) ?? ($block['url'] ?? null);
            }

            return $block;
        }, $blocks);
    }

    /**
     * Permanent viewable URL for an R2 object.
     */
    public static function freshFileUrl(string $path): ?string
    {
        return MediaUrl::for($path);
    }

    /**
     * R2 object keys referenced by the given content blocks.
     *
     * @param  array<int, array<string, mixed>>|null  $blocks
     * @return array<int, string>
     */
    public static function filePathsIn(?array $blocks): array
    {
        return array_values(array_filter(array_map(
            fn ($block) => ($block['type'] ?? null) === 'file' ? MediaUrl::clean($block['path'] ?? null) : null,
            is_array($blocks) ? $blocks : []
        )));
    }
}
