<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One platform decision about one school and one feature.
 *
 * The absence of a row is meaningful: it says nobody has decided, and the
 * feature's own default answers. See the migration.
 */
class InstitutionFeature extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'feature',
        'enabled',
        'updated_by',
    ];

    protected $casts = [
        'enabled' => 'boolean',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }
}
