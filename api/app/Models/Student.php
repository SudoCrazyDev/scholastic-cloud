<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use App\Models\StudentInstitution;

class Student extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'user_id',
        'lrn',
        'first_name',
        'middle_name',
        'last_name',
        'ext_name',
        'gender',
        'religion',
        'birthdate',
        'profile_picture',
        'is_active',
    ];

    public function institutions()
    {
        return $this->belongsToMany(Institution::class, 'student_institutions')
            ->withPivot('is_active', 'academic_year')
            ->withTimestamps();
    }

    public function studentInstitutions()
    {
        return $this->hasMany(StudentInstitution::class);
    }

    public function sections()
    {
        return $this->belongsToMany(ClassSection::class, 'student_sections', 'student_id', 'section_id')
            ->withPivot('academic_year', 'is_active', 'is_promoted')
            ->withTimestamps();
    }

    public function studentSections()
    {
        return $this->hasMany(StudentSection::class);
    }

    /**
     * Subjects the student is explicitly assigned to.
     */
    public function subjects()
    {
        return $this->belongsToMany(Subject::class, 'student_subjects', 'student_id', 'subject_id')
            ->withTimestamps();
    }

    /**
     * Pivot records for subject assignments.
     */
    public function studentSubjects()
    {
        return $this->hasMany(StudentSubject::class, 'student_id');
    }

    /**
     * Get the ECR item scores for the student.
     */
    public function ecrItemScores()
    {
        return $this->hasMany(StudentEcrItemScore::class);
    }

    /**
     * User linked for student portal login (nullable).
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Assessment attempts (quiz/assignment/exam) for live scoring.
     */
    public function assessmentAttempts()
    {
        return $this->hasMany(StudentAssessmentAttempt::class);
    }

    /**
     * Get the profile picture URL. Tries R2 first (temporary or R2_URL), then S3 for legacy paths.
     */
    public function getProfilePictureAttribute($value)
    {
        if (!$value) {
            return null;
        }

        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
            return $value;
        }

        // Try R2 first (institution/student profile pictures stored on R2)
        try {
            $r2Url = config('filesystems.disks.r2.url');
            if ($r2Url) {
                return rtrim($r2Url, '/') . '/' . ltrim($value, '/');
            }
            return Storage::disk('r2')->temporaryUrl($value, now()->addHours(24));
        } catch (\Throwable $e) {
            // Fall back to S3 for legacy paths
            try {
                return Storage::disk('s3')->temporaryUrl($value, now()->addHours(1));
            } catch (\Exception $e2) {
                try {
                    return Storage::disk('s3')->url($value);
                } catch (\Exception $e3) {
                    Log::warning('Failed to generate profile picture URL for student: ' . $this->id . ' - ' . $e3->getMessage());
                    return null;
                }
            }
        }
    }
} 