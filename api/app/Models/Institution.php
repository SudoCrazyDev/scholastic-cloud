<?php

namespace App\Models;

use App\Support\MediaUrl;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class Institution extends Model
{
    use HasFactory, HasUuids;

    /** Shown to students while the portal is closed and no notice was written. */
    public const STUDENT_PORTAL_DISABLED_MESSAGE = 'Student access is temporarily unavailable. Please contact your school.';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'title',
        'abbr',
        'address',
        'division',
        'region',
        'gov_id',
        'logo',
        'theme',
        'subscription_id',
        'default_department_id',
        'current_academic_year',
        'admission_form_open',
        'student_portal_enabled',
        'student_portal_disabled_message',
        'late_penalty_per_minute',
        'undertime_penalty_per_minute',
        'overtime_rate_per_minute',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'subscription_id' => 'string',
        'theme' => 'array',
        'admission_form_open' => 'boolean',
        'student_portal_enabled' => 'boolean',
        'late_penalty_per_minute' => 'decimal:2',
        'undertime_penalty_per_minute' => 'decimal:2',
        'overtime_rate_per_minute' => 'decimal:2',
    ];

    /**
     * Get the logo URL. When logo is stored as an R2 key (institutions/...),
     * returns a temporary signed URL or the public R2 URL when R2_URL is set.
     */
    public function getLogoAttribute($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        // R2 key stored in DB
        if (str_starts_with($value, 'institutions/')) {
            return MediaUrl::for($value);
        }

        // Legacy: full URL (e.g. /storage/...) or existing public URL
        return $value;
    }

    /**
     * What a student is told while this school's portal is closed. A school can
     * word it themselves ("Portal reopens Monday after report cards"); blank
     * falls back to the generic notice.
     */
    public function studentPortalNotice(): string
    {
        $custom = trim((string) $this->student_portal_disabled_message);

        return $custom !== '' ? $custom : self::STUDENT_PORTAL_DISABLED_MESSAGE;
    }

    /**
     * Get the subscription that owns the institution.
     */
    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    /**
     * Get the default department for the institution.
     */
    public function defaultDepartment(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'default_department_id');
    }

    /**
     * Get the departments for the institution.
     */
    public function departments(): HasMany
    {
        return $this->hasMany(Department::class);
    }

    /**
     * Online admission form submissions targeting this institution.
     */
    public function admissionFormSubmissions(): HasMany
    {
        return $this->hasMany(AdmissionFormSubmission::class);
    }

    /**
     * Get the academic years for the institution.
     */
    public function academicYears(): HasMany
    {
        return $this->hasMany(InstitutionAcademicYear::class)->orderByDesc('year');
    }

    /**
     * Get the certificates for the institution.
     */
    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }

    /**
     * Get validation rules for the model.
     */
    public static function getValidationRules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'abbr' => 'required|string|max:50',
            'address' => 'nullable|string|max:500',
            'division' => 'nullable|string|max:255',
            'region' => 'nullable|string|max:255',
            'gov_id' => 'nullable|string|max:255',
            'logo' => 'nullable|file|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            'subscription_id' => 'nullable|uuid|exists:subscriptions,id',
            'default_department_id' => 'nullable|uuid|exists:departments,id',
        ];
    }
}
