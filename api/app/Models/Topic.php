<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Topic extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'subject_id',
        'quarter',
        'title',
        'description',
        'order',
        'is_completed',
    ];

    protected $casts = [
        'is_completed' => 'boolean',
        'order' => 'integer',
    ];

    /**
     * Get the subject that owns the topic.
     */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }
}
