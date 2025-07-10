<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Role extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'title',
        'slug',
    ];

    /**
     * Generate a unique slug for the role.
     */
    public static function generateSlug(string $title): string
    {
        $slug = Str::slug($title);
        $originalSlug = $slug;
        $counter = 1;

        while (static::where('slug', $slug)->exists()) {
            $slug = $originalSlug . '-' . $counter;
            $counter++;
        }

        return $slug;
    }
}
