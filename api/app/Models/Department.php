<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Department extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'title',
        'slug',
    ];

    protected static function booted(): void
    {
        static::creating(function (Department $department) {
            if (empty($department->slug)) {
                $department->slug = Str::slug($department->title);
            }
        });
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function classSections(): HasMany
    {
        return $this->hasMany(ClassSection::class, 'department_id');
    }

    public function schoolDays(): HasMany
    {
        return $this->hasMany(SchoolDay::class, 'department_id');
    }
}
