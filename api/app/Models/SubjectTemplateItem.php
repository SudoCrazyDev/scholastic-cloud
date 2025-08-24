<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubjectTemplateItem extends Model
{
    use HasUuids;
    
    protected $fillable = [
        'template_id',
        'subject_type',
        'parent_item_id',
        'title',
        'variant',
        'start_time',
        'end_time',
        'is_limited_student',
        'order',
    ];

    protected $casts = [
        'is_limited_student' => 'boolean',
        'start_time' => 'datetime:H:i',
        'end_time' => 'datetime:H:i',
        'order' => 'integer',
    ];

    /**
     * Get the template that owns this item.
     */
    public function template(): BelongsTo
    {
        return $this->belongsTo(SubjectTemplate::class, 'template_id');
    }

    /**
     * Get the parent item if this is a child item.
     */
    public function parentItem(): BelongsTo
    {
        return $this->belongsTo(SubjectTemplateItem::class, 'parent_item_id');
    }

    /**
     * Get the child items if this is a parent item.
     */
    public function childItems(): HasMany
    {
        return $this->hasMany(SubjectTemplateItem::class, 'parent_item_id')->orderBy('order');
    }

    /**
     * Check if this item has child items.
     */
    public function hasChildItems(): bool
    {
        return $this->childItems()->exists();
    }

    /**
     * Check if this item is a child item.
     */
    public function isChildItem(): bool
    {
        return !is_null($this->parent_item_id);
    }
}