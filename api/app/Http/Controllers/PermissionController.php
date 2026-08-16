<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Support\Features;
use App\Support\Modules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    /**
     * The module catalog the role builder renders.
     *
     * Platform-only modules (institutions, subscriptions) are included just
     * for a super-administrator, so an institution never sees switches it has
     * no business flipping.
     */
    public function catalog(Request $request): JsonResponse
    {
        $user = $request->user();
        $includeSystemOnly = ! ($user instanceof StudentPortalUser) && $user->hasFullAccess();

        return response()->json([
            'success' => true,
            'data' => [
                'groups' => Modules::catalog($includeSystemOnly),
                'abilities' => Modules::BASE_ABILITIES,
            ],
        ]);
    }

    /**
     * The signed-in user's own permission set, so the client can decide what
     * to render without re-deriving it from the role.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'success' => true,
            'data' => [
                'permissions' => $user->permissionList(),
                'full_access' => $user instanceof StudentPortalUser
                    ? false
                    : $user->hasFullAccess(),
                // What the institution has, alongside what the role may reach.
                'features' => Features::keysForUser($user),
            ],
        ]);
    }
}
