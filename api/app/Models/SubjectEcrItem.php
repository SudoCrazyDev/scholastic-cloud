<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SubjectEcrItem extends Model
{
    use HasUuids;
    
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     *
     * Note: 'type' is nullable in the database.
     */
    protected $fillable = [
        'subject_ecr_id',
        'type',
        'title',
        'description',
        'quarter',
        'academic_year',
        'score',
    ];

    protected $casts = [
        'score' => 'decimal:2',
    ];

    /**
     * Get the student scores for this ECR item.
     */
    public function studentScores()
    {
        return $this->hasMany(StudentEcrItemScore::class);
    }
}