<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One teacher's permission to use Tala, granted by an administrator.
 *
 * This is the whole of the access decision. A role no longer confers
 * `tala.view` or `tala.manage`; `HasModulePermissions` reads an active row here
 * instead, which is why an administrator can answer "why can this teacher use
 * Tala?" from one screen rather than from a role matrix.
 *
 * Revoking sets `is_active` false and keeps the row. Who granted it, who took it
 * back, and when, all outlive the decision — an access question asked in
 * February about a January change should have an answer.
 */
class TalaAccess extends Model
{
    use HasUuids;

    protected $table = 'tala_access';

    protected $fillable = [
        'institution_id',
        'user_id',
        'is_active',
        'granted_by',
        'granted_at',
        'revoked_by',
        'revoked_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'granted_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by');
    }

    /**
     * Does this user hold Tala access at this school right now?
     *
     * Deliberately a bare existence check rather than a model load: it runs on
     * essentially every authenticated request that resolves a permission list.
     */
    public static function isGranted(string $userId, string $institutionId): bool
    {
        return static::query()
            ->where('user_id', $userId)
            ->where('institution_id', $institutionId)
            ->where('is_active', true)
            ->exists();
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeForInstitution(Builder $query, string $institutionId): Builder
    {
        return $query->where('institution_id', $institutionId);
    }

    /**
     * What the administrator's screen shows about one teacher's access.
     *
     * @return array<string, mixed>
     */
    public function toSummary(): array
    {
        return [
            'granted' => $this->is_active,
            'granted_at' => $this->granted_at,
            'granted_by' => $this->grantedBy
                ? trim($this->grantedBy->first_name.' '.$this->grantedBy->last_name)
                : null,
            'revoked_at' => $this->is_active ? null : $this->revoked_at,
        ];
    }
}
