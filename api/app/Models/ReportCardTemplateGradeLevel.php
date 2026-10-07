<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportCardTemplateGradeLevel extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'report_card_template_id',
        'grade_level',
    ];

    public function template(): BelongsTo
    {
        return $this->belongsTo(ReportCardTemplate::class, 'report_card_template_id');
    }
}
