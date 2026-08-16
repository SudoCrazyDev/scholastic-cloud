<?php

namespace App\Models;

use App\Support\Modules;
use App\Support\SystemRolePermissions;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Role extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'institution_id',
        'title',
        'slug',
        'is_system',
    ];

    protected $casts = [
        'is_system' => 'boolean',
    ];

    protected static function booted(): void
    {
        // A built-in role arrives with its built-in access. Without this, a
        // platform role created outside the seeder — a fresh migration, or a
        // test that builds a "principal" — would exist with no permissions and
        // silently behave like a role that can reach nothing.
        //
        // Institution-created roles are never touched: they hold exactly what
        // their school ticked in the role builder, including nothing.
        static::created(function (Role $role) {
            if ($role->institution_id !== null) {
                return;
            }

            if (! SystemRolePermissions::knows((string) $role->slug)) {
                return;
            }

            $role->syncPermissions(SystemRolePermissions::for((string) $role->slug));
        });
    }

    /**
     * Generate a slug unique within the role's own institution.
     *
     * System roles (institution_id null) share one namespace; each institution
     * gets its own, so two schools can both name a role "Cashier".
     *
     * `$ignoreId` is the role being renamed, and must be passed on every update.
     * Without it a role collides with its own stored slug: saving "Department
     * Head" without touching the name finds the row itself, decides
     * `department-head` is taken, and writes `department-head-1`. That is not
     * hypothetical — it happened to Maranatha's Department Head on 2026-08-12 and
     * cost five department heads their institution-wide subject list, six days
     * after a migration repaired the identical suffix on their administrator
     * role.
     */
    public static function generateSlug(string $title, ?string $institutionId = null, int|string|null $ignoreId = null): string
    {
        $slug = Str::slug($title);
        $originalSlug = $slug;
        $counter = 1;

        while (
            static::where('slug', $slug)
                ->when($ignoreId !== null, fn ($query) => $query->whereKeyNot($ignoreId))
                ->where(function ($query) use ($institutionId) {
                    $institutionId === null
                        ? $query->whereNull('institution_id')
                        : $query->where('institution_id', $institutionId);
                })
                ->exists()
        ) {
            $slug = $originalSlug.'-'.$counter;
            $counter++;
        }

        return $slug;
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function permissions()
    {
        return $this->hasMany(RolePermission::class);
    }

    public function userInstitutions()
    {
        return $this->hasMany(UserInstitution::class);
    }

    /**
     * Only the roles a given institution may assign: its own, plus the
     * platform's built-in ones.
     */
    public function scopeAvailableTo($query, ?string $institutionId)
    {
        return $query->where(function ($q) use ($institutionId) {
            $q->whereNull('institution_id');

            if ($institutionId !== null) {
                $q->orWhere('institution_id', $institutionId);
            }
        });
    }

    /**
     * The role's permission strings, with implied grants expanded.
     *
     * @return array<string>
     */
    public function permissionList(): array
    {
        return Modules::expand(
            $this->relationLoaded('permissions')
                ? $this->permissions->pluck('permission')->all()
                : $this->permissions()->pluck('permission')->all()
        );
    }

    public function grantsEverything(): bool
    {
        return in_array(Modules::WILDCARD, $this->permissionList(), true);
    }

    /**
     * Replace the role's permissions with the given set.
     *
     * Anything not in the module catalog is dropped rather than rejected — the
     * caller validates first, and a stale key from an old client should not be
     * able to write a row nothing will ever enforce.
     *
     * Implied grants are expanded before saving, so what is stored is exactly
     * what gets enforced. Persisting a bare `finance.manage` would otherwise
     * read back into the role builder as "can edit but cannot view".
     *
     * @param  array<string>  $permissions
     */
    public function syncPermissions(array $permissions): void
    {
        $valid = array_values(array_unique(array_filter(
            Modules::expand($permissions),
            fn ($permission) => $permission === Modules::WILDCARD
                || Modules::isValidPermission($permission)
        )));

        $this->permissions()->whereNotIn('permission', $valid ?: [''])->delete();

        $existing = $this->permissions()->pluck('permission')->all();

        $rows = array_map(fn ($permission) => [
            'role_id' => $this->id,
            'permission' => $permission,
            'created_at' => now(),
            'updated_at' => now(),
        ], array_values(array_diff($valid, $existing)));

        if ($rows !== []) {
            RolePermission::insert($rows);
        }

        $this->unsetRelation('permissions');
    }
}
