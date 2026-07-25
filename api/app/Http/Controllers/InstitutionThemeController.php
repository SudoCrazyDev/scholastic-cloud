<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Institution;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per-institution color theme (self-serve for institution admins).
 *
 * The theme is one base hex per themeable slot; the frontend generates the full
 * shade ramp from it. Only the slots below are accepted — neutral/gray is not
 * themeable. Null/absent slots fall back to the app defaults.
 */
class InstitutionThemeController extends Controller
{
    private const SLOTS = ['primary', 'success', 'warning', 'danger', 'info'];

    public function show(Request $request): JsonResponse
    {
        if (! $this->canManageTheme($request)) {
            return $this->forbidden();
        }

        $institution = $this->resolveInstitution($request);
        if (! $institution) {
            return $this->noInstitution();
        }

        return response()->json([
            'success' => true,
            'data' => ['theme' => $institution->theme],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        if (! $this->canManageTheme($request)) {
            return $this->forbidden();
        }

        $institution = $this->resolveInstitution($request);
        if (! $institution) {
            return $this->noInstitution();
        }

        $rules = ['theme' => 'nullable|array'];
        foreach (self::SLOTS as $slot) {
            $rules["theme.$slot"] = 'nullable|string|regex:/^#?[0-9a-fA-F]{6}$/';
        }
        $validated = $request->validate($rules);

        $institution->update(['theme' => $this->normalize($validated['theme'] ?? null)]);

        return response()->json([
            'success' => true,
            'message' => 'Theme updated.',
            'data' => ['theme' => $institution->fresh()->theme],
        ]);
    }

    /**
     * Keep only known slots, drop empties, and prefix bare hex values with '#'.
     * Returns null when nothing usable remains, resetting to app defaults.
     */
    private function normalize(?array $theme): ?array
    {
        if (! $theme) {
            return null;
        }

        $clean = [];
        foreach (self::SLOTS as $slot) {
            $value = $theme[$slot] ?? null;
            if (is_string($value) && $value !== '') {
                $clean[$slot] = str_starts_with($value, '#') ? strtolower($value) : '#'.strtolower($value);
            }
        }

        return $clean === [] ? null : $clean;
    }

    private function resolveInstitution(Request $request): ?Institution
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            $institutionId = $firstUserInstitution?->institution_id;
        }

        return $institutionId ? Institution::find($institutionId) : null;
    }

    private function canManageTheme(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return in_array((string) ($role->slug ?? ''), ['institution-administrator', 'super-administrator'], true);
    }

    private function forbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'You are not allowed to manage the institution theme.',
        ], 403);
    }

    private function noInstitution(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'User does not have any institution assigned.',
        ], 400);
    }
}
