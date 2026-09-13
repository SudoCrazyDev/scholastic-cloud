<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Which catalog version a grade level gets by default.
 *
 * Only consulted when a section opts in. After that the section carries its own
 * pin, so changing this never disturbs a section already mid-year.
 *
 * `grade_level` is the primary key, which is what makes "one default per grade
 * level" structural rather than a rule someone has to remember.
 */
class MatatagGradeLevelCurriculum extends Model
{
    use HasFactory;

    protected $table = 'matatag_grade_level_curricula';

    protected $primaryKey = 'grade_level';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'grade_level',
        'curriculum_version_id',
    ];

    public function curriculumVersion()
    {
        return $this->belongsTo(MatatagCurriculumVersion::class, 'curriculum_version_id');
    }
}
