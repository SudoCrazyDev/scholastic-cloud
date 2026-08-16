<?php

namespace App\Support;

use App\Auth\StudentPortalUser;
use App\Models\InstitutionFeature;

/**
 * Reads config/features.php and answers what a given institution has.
 *
 * The counterpart of App\Support\Modules, and deliberately a separate thing:
 * Modules answers "may this person open the screen", decided by the school;
 * this answers "does this school have the thing at all", decided by the
 * platform. A feature that is off is off for the school's own administrator
 * too, which is exactly what a role permission can never express.
 */
class Features
{
    /**
     * Per-request memo. A single response can ask several times — middleware,
     * then the profile payload, then a controller — and the answer cannot
     * change mid-request.
     *
     * @var array<string, array<string, bool>>
     */
    protected static array $resolved = [];

    /**
     * The catalog as configured, each entry filled out with its key.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function catalog(): array
    {
        $catalog = [];

        foreach (config('features', []) as $key => $feature) {
            $catalog[$key] = $feature + [
                'key' => $key,
                'label' => $key,
                'description' => '',
                'default_enabled' => false,
                'notes' => null,
            ];
        }

        return $catalog;
    }

    public static function exists(string $feature): bool
    {
        return array_key_exists($feature, static::catalog());
    }

    /**
     * Every feature and whether this institution has it.
     *
     * Stored rows win; anything without a row falls back to the feature's own
     * default. A stored row naming a feature that no longer exists in the
     * catalog is ignored rather than reported — features are removed by
     * deleting code, and their rows outlive them harmlessly.
     *
     * @return array<string, bool>
     */
    public static function for(?string $institutionId): array
    {
        $catalog = static::catalog();

        $state = [];
        foreach ($catalog as $key => $feature) {
            $state[$key] = (bool) $feature['default_enabled'];
        }

        if (! $institutionId) {
            return $state;
        }

        if (isset(static::$resolved[$institutionId])) {
            return static::$resolved[$institutionId];
        }

        $decided = InstitutionFeature::where('institution_id', $institutionId)
            ->pluck('enabled', 'feature');

        foreach ($decided as $feature => $enabled) {
            if (isset($state[$feature])) {
                $state[$feature] = (bool) $enabled;
            }
        }

        return static::$resolved[$institutionId] = $state;
    }

    /** Does this institution have the feature? */
    public static function enabled(?string $institutionId, string $feature): bool
    {
        return static::for($institutionId)[$feature] ?? false;
    }

    /**
     * The enabled feature keys, for the profile payload.
     *
     * A list rather than a map, to match how `permissions` already travels to
     * the client — the frontend asks "is this in the set", never "what is the
     * value of this key".
     *
     * @return array<int, string>
     */
    public static function enabledKeys(?string $institutionId): array
    {
        return array_values(array_keys(array_filter(static::for($institutionId))));
    }

    /**
     * The institution a signed-in person is currently acting in.
     *
     * Three inbound identities, as everywhere else in this app: staff are a
     * `users` row, a student signing in through the portal is a
     * StudentPortalUser, and a student can also appear as a User carrying the
     * `student` role slug.
     *
     * The portal case has to be handled explicitly. StudentPortalUser answers
     * getDefaultInstitutionId() with a deliberate `null` stub — it exists only
     * so staff-only controllers do not fatal — so trusting it here would have
     * left every portal student with no institution, and therefore with every
     * feature switched off no matter what their school actually has.
     */
    public static function institutionOf($user): ?string
    {
        if (! $user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return static::institutionOfStudent($user->student);
        }

        if (! method_exists($user, 'getDefaultInstitutionId')) {
            return null;
        }

        return $user->getDefaultInstitutionId();
    }

    /**
     * The institution a Student belongs to.
     *
     * Their active enrolment, falling back to any of them — the same rule
     * ChatPrincipal uses, so a student whose enrolment has been closed out at
     * the end of a year still resolves to the school they were at.
     */
    public static function institutionOfStudent($student): ?string
    {
        if (! $student) {
            return null;
        }

        return $student->studentInstitutions()
            ->where('is_active', true)
            ->value('institution_id')
            ?? $student->studentInstitutions()->value('institution_id');
    }

    /**
     * A student's features, from their own institution row.
     *
     * @return array<int, string>
     */
    public static function keysForStudent($student): array
    {
        return static::enabledKeys(static::institutionOfStudent($student));
    }

    public static function enabledForUser($user, string $feature): bool
    {
        return static::enabled(static::institutionOf($user), $feature);
    }

    /** @return array<int, string> */
    public static function keysForUser($user): array
    {
        return static::enabledKeys(static::institutionOf($user));
    }

    /**
     * Drop the memo. For tests and for the controller, which reads the state
     * back after writing it.
     */
    public static function flush(?string $institutionId = null): void
    {
        if ($institutionId === null) {
            static::$resolved = [];

            return;
        }

        unset(static::$resolved[$institutionId]);
    }
}
