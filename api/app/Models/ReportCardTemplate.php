<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A school's report card design, assigned to the grade levels that print it.
 *
 * `layout` names a card the frontend knows how to draw; `settings` is the
 * school's wording for it. The server stores both and resolves which template a
 * grade level uses — it never renders a card itself.
 */
class ReportCardTemplate extends Model
{
    use HasUuids;

    /**
     * Layouts the frontend can draw, keyed by the value stored in `layout`.
     * Adding a layout means adding its renderer in the SPA too.
     */
    public const LAYOUTS = [
        'shs_semestral' => 'Senior High School — Semestral (SF 9)',
    ];

    protected $fillable = [
        'institution_id',
        'name',
        'layout',
        'settings',
    ];

    protected $casts = [
        'settings' => 'array',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function gradeLevels(): HasMany
    {
        return $this->hasMany(ReportCardTemplateGradeLevel::class);
    }
}
