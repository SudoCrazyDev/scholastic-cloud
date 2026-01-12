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
        'scheduled_date',
        'score',
    ];

    protected $casts = [
        'score' => 'decimal:2',
        'scheduled_date' => 'date:Y-m-d',
    ];

    /**
     * Get the student scores for this ECR item.
     */
    public function studentScores()
    {
        return $this->hasMany(StudentEcrItemScore::class);
    }

    /**
     * Get the subject ECR that owns this item.
     */
    public function subjectEcr()
    {
        return $this->belongsTo(SubjectEcr::class, 'subject_ecr_id');
    }

    /**
     * Get the subject through the subject ECR.
     */
    public function subject()
    {
        return $this->hasOneThrough(
            Subject::class,
            SubjectEcr::class,
            'id', // Foreign key on SubjectEcr table...
            'id', // Foreign key on Subject table...
            'subject_ecr_id', // Local key on this model...
            'subject_id' // Local key on SubjectEcr table...
        );
    }
}