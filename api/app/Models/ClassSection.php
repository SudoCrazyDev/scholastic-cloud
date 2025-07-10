<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class ClassSection extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'grade_level',
        'title',
        'adviser',
        'academic_year',
    ];

    /**
     * Get the adviser (user) for this class section.
     */
    public function adviser()
    {
        return $this->belongsTo(User::class, 'adviser');
    }

    /**
     * Get the institution that owns this class section.
     */
    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }
} 