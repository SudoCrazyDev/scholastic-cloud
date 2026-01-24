<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class AiGenerationTask extends Model
{
    protected $fillable = [
        'id',
        'type',
        'subject_id',
        'quarter',
        'user_id',
        'status',
        'total_items',
        'processed_items',
        'result',
        'error_message',
    ];

    protected $casts = [
        'result' => 'array',
        'total_items' => 'integer',
        'processed_items' => 'integer',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }

    public function updateProgress(int $processed): void
    {
        $this->update([
            'processed_items' => $processed,
            'status' => $processed >= $this->total_items ? 'completed' : 'processing',
        ]);
    }

    public function markCompleted(array $result = []): void
    {
        $this->update([
            'status' => 'completed',
            'result' => $result,
            'processed_items' => $this->total_items,
        ]);
    }

    public function markFailed(string $error): void
    {
        $this->update([
            'status' => 'failed',
            'error_message' => $error,
        ]);
    }
}
