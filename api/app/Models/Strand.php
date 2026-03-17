<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Strand extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'track_id',
        'title',
        'slug',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function track()
    {
        return $this->belongsTo(Track::class);
    }

    public function classSections()
    {
        return $this->hasMany(ClassSection::class);
    }
}
