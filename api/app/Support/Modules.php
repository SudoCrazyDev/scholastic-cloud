<?php

namespace App\Support;

/**
 * Reads config/modules.php and answers the questions the rest of the app asks
 * of the module catalog: what modules exist, which permission strings are
 * valid, and what the role builder should render.
 */
class Modules
{
    /**
     * Abilities every permissioned module carries.
     *
     * @var array<string>
     */
    public const BASE_ABILITIES = ['view', 'manage'];

    /**
     * Grants everything, including modules added after the role was saved.
     * Only ever held by the super-administrator system role.
     */
    public const WILDCARD = '*';

    /**
     * The catalog as configured, untouched.
     */
    public static function groups(): array
    {
        return config('modules.groups', []);
    }

    /**
     * Modules that are never permission-gated (a person's own records).
     *
     * @return array<string>
     */
    public static function personal(): array
    {
        return config('modules.personal', []);
    }

    /**
     * Every module keyed by its slug, with its group folded in.
     *
     * @return array<string, array>
     */
    public static function all(): array
    {
        static $flat = null;

        if ($flat !== null) {
            return $flat;
        }

        $flat = [];

        foreach (static::groups() as $groupKey => $group) {
            foreach ($group['modules'] ?? [] as $moduleKey => $module) {
                $flat[$moduleKey] = $module + [
                    'key' => $moduleKey,
                    'group' => $groupKey,
                    'group_label' => $group['label'] ?? $groupKey,
                    'special' => $module['special'] ?? [],
                    'system_only' => $module['system_only'] ?? false,
                ];
            }
        }

        return $flat;
    }

    /**
     * Modules an institution may hand out in its own role builder — everything
     * except platform administration.
     *
     * @return array<string, array>
     */
    public static function assignable(): array
    {
        return array_filter(static::all(), fn ($m) => ! $m['system_only']);
    }

    /**
     * Every valid permission string, e.g. "finance.view", "finance.approve-void".
     *
     * @return array<string>
     */
    public static function permissions(): array
    {
        static $permissions = null;

        if ($permissions !== null) {
            return $permissions;
        }

        $permissions = [];

        foreach (static::all() as $key => $module) {
            foreach (static::BASE_ABILITIES as $ability) {
                $permissions[] = "{$key}.{$ability}";
            }

            foreach (array_keys($module['special']) as $ability) {
                $permissions[] = "{$key}.{$ability}";
            }
        }

        return $permissions;
    }

    /**
     * Permission strings an institution-created role is allowed to hold.
     *
     * @return array<string>
     */
    public static function assignablePermissions(): array
    {
        $assignable = array_keys(static::assignable());

        return array_values(array_filter(
            static::permissions(),
            fn ($permission) => in_array(static::moduleOf($permission), $assignable, true)
        ));
    }

    public static function isValidPermission(string $permission): bool
    {
        return in_array($permission, static::permissions(), true);
    }

    /**
     * The module half of a permission string ("finance.manage" -> "finance").
     * Module keys never contain a dot, so splitting on the first one is safe.
     */
    public static function moduleOf(string $permission): string
    {
        return explode('.', $permission, 2)[0];
    }

    /**
     * Expand a saved permission set into everything it implies.
     *
     * `manage` implies `view` — a role that can edit fees can obviously read
     * them, and making the role builder enforce that pairing by hand would
     * just be a way to create broken roles.
     *
     * @param  array<string>  $permissions
     * @return array<string>
     */
    public static function expand(array $permissions): array
    {
        if (in_array(static::WILDCARD, $permissions, true)) {
            return [static::WILDCARD];
        }

        $expanded = [];

        foreach ($permissions as $permission) {
            $expanded[$permission] = true;

            // Anything beyond a bare `view` — `manage` or a special ability
            // like `approve-void` — is useless without being able to open the
            // module, so it carries `view` with it.
            if (! str_ends_with($permission, '.view')) {
                $expanded[static::moduleOf($permission).'.view'] = true;
            }
        }

        return array_keys($expanded);
    }

    /**
     * The catalog shaped for the role builder UI.
     */
    public static function catalog(bool $includeSystemOnly = false): array
    {
        $groups = [];

        foreach (static::groups() as $groupKey => $group) {
            $modules = [];

            foreach ($group['modules'] ?? [] as $moduleKey => $module) {
                if (($module['system_only'] ?? false) && ! $includeSystemOnly) {
                    continue;
                }

                $special = [];
                foreach ($module['special'] ?? [] as $abilityKey => $ability) {
                    $special[] = [
                        'key' => $abilityKey,
                        'permission' => "{$moduleKey}.{$abilityKey}",
                        'label' => $ability['label'] ?? $abilityKey,
                        'description' => $ability['description'] ?? null,
                    ];
                }

                $modules[] = [
                    'key' => $moduleKey,
                    'label' => $module['label'] ?? $moduleKey,
                    'description' => $module['description'] ?? null,
                    'system_only' => $module['system_only'] ?? false,
                    'special' => $special,
                ];
            }

            if ($modules === []) {
                continue;
            }

            $groups[] = [
                'key' => $groupKey,
                'label' => $group['label'] ?? $groupKey,
                'modules' => $modules,
            ];
        }

        return $groups;
    }
}
