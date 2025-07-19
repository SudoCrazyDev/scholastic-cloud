<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subject extends Model
{
    use HasUuids;
    
    protected $fillable = [
        'institution_id',
        'class_section_id',
        'adviser',
        'subject_type',
        'parent_subject_id',
        'title',
        'variant',
        'start_time',
        'end_time',
        'is_limited_student',
        'order',
    ];

    protected $casts = [
        'is_limited_student' => 'boolean',
        'start_time' => 'datetime:H:i',
        'end_time' => 'datetime:H:i',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function classSection(): BelongsTo
    {
        return $this->belongsTo(ClassSection::class);
    }

    public function adviserUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'adviser');
    }

    public function parentSubject(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'parent_subject_id');
    }

    public function childSubjects(): HasMany
    {
        return $this->hasMany(Subject::class, 'parent_subject_id');
    }

    /**
     * Get the subject ECRs for this subject.
     */
    public function subjectEcrs(): HasMany
    {
        return $this->hasMany(SubjectEcr::class);
    }
}
