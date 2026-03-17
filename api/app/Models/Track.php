<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Track extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'title',
        'slug',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function strands()
    {
        return $this->hasMany(Strand::class);
    }

    public function classSections()
    {
        return $this->hasMany(ClassSection::class);
    }
}
