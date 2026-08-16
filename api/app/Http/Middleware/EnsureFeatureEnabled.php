<?php

namespace App\Http\Middleware;

use App\Support\Features;
use Closure;
use Illuminate\Http\Request;

/**
 * Gates a route on the institution having the feature at all.
 *
 *   Route::middleware('feature:chat')
 *
 * The other half of the pair with EnsureModuleAccess, and a different question:
 * that one asks whether this person's role may open the screen, this one asks
 * whether their school has the thing. Both can apply, and a route carrying both
 * must pass both.
 *
 * 403 rather than 404. A school's own administrator asking why chat has
 * disappeared deserves a straight answer — the feature is off for them and only
 * the platform can turn it back on — and there is nothing here to hide: the
 * endpoint's existence is not a secret, and every route behind it is already
 * scoped to the caller's own data.
 *
 * Not even a super-administrator is let through. Their wildcard is a permission
 * wildcard, and this is not a permission: it says what the institution has, and
 * a platform administrator wanting to use chat at a school should switch the
 * school on rather than quietly be the exception.
 *
 * Runs after auth.token, so anything reaching here has a resolved user.
 */
class EnsureFeatureEnabled
{
    public function handle(Request $request, Closure $next, string $feature)
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'message' => 'Authorization token required',
            ], 401);
        }

        if (Features::enabledForUser($user, $feature)) {
            return $next($request);
        }

        $label = Features::catalog()[$feature]['label'] ?? $feature;

        return response()->json([
            'message' => "{$label} is not enabled for this institution.",
            'error' => 'feature_disabled',
            'feature' => $feature,
        ], 403);
    }
}
