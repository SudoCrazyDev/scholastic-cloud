<?php

namespace App\Http\Controllers\Concerns;

use App\Auth\StudentPortalUser;
use App\Models\Student;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Controller-side guards for the module permission system.
 *
 * The `auth.token` middleware only proves who the caller is — it says nothing
 * about what they may reach, and it lets student portal tokens through on the
 * same footing as staff tokens. Anything that is not a student's own record
 * therefore has to establish two things for itself: that the caller is staff
 * holding the right module permission, and that the institution the request
 * talks about is one the caller actually belongs to.
 *
 * The guards return a `JsonResponse` to send, or `null` to continue, rather
 * than throwing: several controllers wrap their bodies in `catch (\Exception)`,
 * which would swallow an exception-based guard and downgrade a deliberate 403
 * into a 500.
 */
trait AuthorizesModuleAccess
{
    /**
     * The caller as a staff user, or null when they are a student portal user.
     *
     * `StudentPortalUser` deliberately answers false to every permission check,
     * so this is about giving callers a clearer message than "forbidden".
     */
    protected function staffUser(Request $request): ?User
    {
        $user = $request->user();

        return $user instanceof User ? $user : null;
    }

    /**
     * The caller as a staff user, written to `$user`, or a 403 to return.
     *
     * `staffUser()` is nullable, and a controller that has already established
     * the caller is staff — by calling `resolveRequestedInstitution()`, say —
     * still has to convince a static analyser of it. This is the out-param
     * form, so `$user` is a plain User for the rest of the method.
     *
     * @param  User|null  $user  out-param: the caller as a staff user
     * @return JsonResponse|null 403 to return, or null when the caller may continue
     */
    protected function resolveStaff(Request $request, ?User &$user): ?JsonResponse
    {
        $user = $this->staffUser($request);

        return $user === null
            ? $this->forbidden('This endpoint is only available to staff accounts')
            : null;
    }

    protected function forbidden(string $message = 'You are not allowed to perform this action'): JsonResponse
    {
        return response()->json(['success' => false, 'message' => $message], 403);
    }

    /**
     * Is the caller acting as a student?
     *
     * Two shapes exist: a portal login (`StudentPortalUser`) and the older
     * arrangement where a student has a `users` row carrying the `student`
     * role. Both have to be caught, or a check written for one silently lets
     * the other through.
     */
    protected function isStudentActor(Request $request): bool
    {
        $user = $request->user();

        if (! $user) {
            return false;
        }

        if ($user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'student';
    }

    /**
     * The student record the caller *is*, when they are acting as one.
     *
     * Used to narrow a shared endpoint to the caller's own rows — a student
     * reading their grades should see theirs and no one else's.
     */
    protected function actingStudentId(Request $request): ?string
    {
        $user = $request->user();

        if (! $user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student->id;
        }

        return Student::where('user_id', $user->id)->value('id');
    }

    /**
     * Deny anyone who is not a staff user.
     *
     * @return JsonResponse|null 403 to return, or null when the caller may continue
     */
    protected function denyUnlessStaff(Request $request): ?JsonResponse
    {
        return $this->staffUser($request) === null
            ? $this->forbidden('This endpoint is only available to staff accounts')
            : null;
    }

    /**
     * Deny unless the caller is staff holding `{module}.{ability}`.
     *
     * Pass `$institutionId` when the request names the institution it acts on,
     * so the check uses the role the caller holds *there* rather than the role
     * from their default institution.
     *
     * @return JsonResponse|null 403 to return, or null when the caller may continue
     */
    protected function denyUnlessModule(
        Request $request,
        string $module,
        string $ability = 'view',
        ?string $institutionId = null,
    ): ?JsonResponse {
        $user = $this->staffUser($request);

        if (! $user) {
            return $this->forbidden('This endpoint is only available to staff accounts');
        }

        if (! $user->hasModuleAccess($module, $ability, $institutionId)) {
            return $this->forbidden('You do not have access to this module');
        }

        return null;
    }

    /**
     * Every institution the caller belongs to.
     *
     * @return array<string>
     */
    protected function callerInstitutionIds(Request $request): array
    {
        $user = $this->staffUser($request);

        if (! $user) {
            return [];
        }

        return $user->userInstitutions()->pluck('institution_id')->all();
    }

    /**
     * The institution a request acts on when it does not name one: the
     * caller's default, then main, then whichever comes first.
     *
     * Mirrors the fallback `User::getRole()` uses, so the institution a request
     * is scoped to and the role it is judged against never disagree.
     */
    protected function activeInstitutionId(Request $request): ?string
    {
        $user = $this->staffUser($request);

        if (! $user) {
            return null;
        }

        return $user->getDefaultInstitutionId()
            ?? $user->userInstitutions()->first()?->institution_id;
    }

    /**
     * May the caller act on this institution?
     *
     * Super-administrators hold the wildcard and are intentionally unscoped —
     * they operate across tenants. Everyone else must hold a membership.
     */
    protected function callerCanAccessInstitution(Request $request, ?string $institutionId): bool
    {
        $user = $this->staffUser($request);

        if (! $user || $institutionId === null) {
            return false;
        }

        if ($user->hasFullAccess()) {
            return true;
        }

        return in_array($institutionId, $this->callerInstitutionIds($request), true);
    }

    /**
     * Resolve the institution a request acts on, honouring a client-supplied
     * `institution_id` only when the caller belongs to it.
     *
     * Taking the institution straight from the request is how several
     * endpoints ended up readable across tenants: `exists:institutions,id`
     * proves the row exists, not that the caller has any business with it.
     *
     * Writes the resolved id to `$institutionId` and returns null when the
     * request may proceed; returns the response to send otherwise.
     *
     * @param  string|null  $institutionId  out-param: the institution to scope to
     * @return JsonResponse|null response to return, or null when the caller may continue
     */
    protected function resolveRequestedInstitution(
        Request $request,
        ?string &$institutionId,
        string $key = 'institution_id',
    ): ?JsonResponse {
        if ($this->denyUnlessStaff($request) !== null) {
            return $this->forbidden('This endpoint is only available to staff accounts');
        }

        $requested = $request->input($key);

        if (is_string($requested) && $requested !== '') {
            if (! $this->callerCanAccessInstitution($request, $requested)) {
                return $this->forbidden('You do not have access to this institution');
            }

            $institutionId = $requested;

            return null;
        }

        $institutionId = $this->activeInstitutionId($request);

        if ($institutionId === null) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        return null;
    }
}
