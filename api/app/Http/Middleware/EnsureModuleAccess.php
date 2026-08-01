<?php

namespace App\Http\Middleware;

use App\Auth\StudentPortalUser;
use App\Support\Modules;
use Closure;
use Illuminate\Http\Request;

/**
 * Gates a route on a module permission.
 *
 *   Route::middleware('module:finance,view')   -> needs finance.view
 *   Route::middleware('module:finance,manage') -> needs finance.manage
 *   Route::middleware('module:finance,approve-void')
 *
 * A third `shared` argument marks an endpoint the student portal also calls:
 *
 *   Route::middleware('module:students,view,shared')
 *
 * Staff still need the permission; a signed-in student is passed through to
 * the controller, which already narrows the query to that student's own
 * record. Without this, gating `students.view` would lock students out of
 * their own profile and ledger.
 *
 * Runs after auth.token, so an unauthenticated request has already been
 * turned away with a 401 and anything reaching here has a resolved user.
 */
class EnsureModuleAccess
{
    public function handle(Request $request, Closure $next, string $module, string $ability = 'view', ?string $audience = null)
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'message' => 'Authorization token required',
            ], 401);
        }

        if ($audience === 'shared' && $user instanceof StudentPortalUser) {
            return $next($request);
        }

        // Write verbs on a route declared `view` still require `manage`. This
        // keeps the route declarations short — a resource group can be marked
        // `view` once — while making sure a read-only role cannot POST to it.
        if ($ability === 'view' && ! $request->isMethodSafe()) {
            $ability = 'manage';
        }

        if (! $user->hasModuleAccess($module, $ability)) {
            return response()->json([
                'message' => $this->denialMessage($module, $ability),
                'error' => 'forbidden',
                'required_permission' => "{$module}.{$ability}",
            ], 403);
        }

        return $next($request);
    }

    /**
     * A message that names the module the way the role builder does, so a user
     * reading it can tell their administrator exactly what to tick.
     */
    protected function denialMessage(string $module, string $ability): string
    {
        $catalog = Modules::all();
        $label = $catalog[$module]['label'] ?? $module;

        if (in_array($ability, Modules::BASE_ABILITIES, true)) {
            return $ability === 'view'
                ? "Your role does not have access to {$label}."
                : "Your role can view {$label} but not make changes to it.";
        }

        $abilityLabel = $catalog[$module]['special'][$ability]['label'] ?? $ability;

        return "Your role is not allowed to: {$abilityLabel}.";
    }
}
