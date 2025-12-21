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
     * Get the profile picture URL with temporary signed URL if it's an S3 path.
     */
    public function getProfilePictureAttribute($value)
    {
        if (!$value) {
            return null;
        }

        // If it's already a full URL (starts with http), return as is (for legacy data)
        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
            return $value;
        }

        // If it's an S3 path, generate a temporary signed URL (valid for 1 hour)
        try {
            return Storage::disk('s3')->temporaryUrl($value, now()->addHours(1));
        } catch (\Exception $e) {
            // If temporary URL generation fails, try regular URL as fallback
            try {
                return Storage::disk('s3')->url($value);
            } catch (\Exception $e2) {
                Log::warning('Failed to generate profile picture URL for student: ' . $this->id . ' - ' . $e2->getMessage());
                return null;
            }
        }
    }
} 