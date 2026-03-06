<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReceiptTemplate extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'name',
        'is_default',
        'paper_size',
        'layout',
        'created_by',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'layout' => 'array',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
