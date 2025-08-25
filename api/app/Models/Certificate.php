<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Certificate extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'title',
        'design_json',
        'institution_id',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'design_json' => 'array',
    ];

    /**
     * Get the institution that owns the certificate.
     */
    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    /**
     * Get the user who created the certificate.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the user who last updated the certificate.
     */
    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}