<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One learner's report card, released to them in the student portal.
 *
 * The row existing is the publication; see the table migration.
 */
class ReportCardPublication extends Model
{
    use HasUuids;

    /** The numeric card, or a school's own template for the grade level. */
    public const TYPE_REPORT_CARD = 'report-card';

    /** DepEd's Learner's Performance Report (DO 15, s. 2026). */
    public const TYPE_PERFORMANCE_REPORT = 'performance-report';

    /** The MATATAG progress report card (Kindergarten and Key Stage 1). */
    public const TYPE_MATATAG = 'matatag';

    public const TYPES = [
        self::TYPE_REPORT_CARD,
        self::TYPE_PERFORMANCE_REPORT,
        self::TYPE_MATATAG,
    ];

    protected $fillable = [
        'institution_id',
        'student_id',
        'class_section_id',
        'academic_year',
        'card_type',
        'published_by',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function classSection(): BelongsTo
    {
        return $this->belongsTo(ClassSection::class);
    }

    public function publishedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'published_by');
    }
}
