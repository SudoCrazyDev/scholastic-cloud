<?php

namespace App\Http\Controllers;

use App\Models\Institution;
use App\Models\InstitutionFeature;
use App\Support\Features;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Which schools have which features. Platform administration, not a school's
 * own setting — see config/features.php for why the two are separate.
 *
 * Every route here is behind `module:feature-access`, which is `system_only`
 * and therefore reachable only by a wildcard holder. An institution cannot be
 * granted this in its own role builder, which is the point: a school deciding
 * for itself which features it has would make the screen pointless.
 */
class InstitutionFeatureController extends Controller
{
    /**
     * The catalog, and every institution's state for it.
     *
     * One response rather than a call per institution — the screen is a matrix,
     * and there are tens of schools rather than thousands.
     */
    public function index(): JsonResponse
    {
        $catalog = Features::catalog();

        $institutions = Institution::query()
            ->orderBy('title')
            ->get(['id', 'title']);

        // One query for every decision on record, grouped in memory. The
        // alternative is a query per institution.
        $decisions = InstitutionFeature::all()
            ->groupBy('institution_id');

        $rows = $institutions->map(function (Institution $institution) use ($catalog, $decisions) {
            $stored = $decisions->get($institution->id, collect())->keyBy('feature');

            $features = [];
            foreach ($catalog as $key => $feature) {
                $row = $stored->get($key);

                $features[$key] = [
                    'enabled' => $row ? (bool) $row->enabled : (bool) $feature['default_enabled'],
                    // The screen distinguishes a decision from a default, so
                    // whoever is looking can tell "nobody has considered this
                    // school" from "someone turned it off".
                    'decided' => (bool) $row,
                    'updated_at' => $row?->updated_at?->toJSON(),
                ];
            }

            return [
                'id' => $institution->id,
                'title' => $institution->title,
                'features' => $features,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => [
                'features' => array_values($catalog),
                'institutions' => $rows->values(),
            ],
        ]);
    }

    /**
     * Turn one feature on or off for one institution.
     *
     * Deliberately one at a time. A matrix screen that saved in bulk would make
     * a mis-click on the wrong row indistinguishable from an intended change,
     * and these switches are rare enough that a request each costs nothing.
     */
    public function update(Request $request, string $institutionId, string $feature): JsonResponse
    {
        if (! Features::exists($feature)) {
            return response()->json([
                'success' => false,
                'message' => 'Unknown feature.',
            ], 404);
        }

        $institution = Institution::find($institutionId);
        if (! $institution) {
            return response()->json([
                'success' => false,
                'message' => 'Institution not found.',
            ], 404);
        }

        $validated = $request->validate([
            'enabled' => 'required|boolean',
        ]);

        InstitutionFeature::updateOrCreate(
            ['institution_id' => $institution->id, 'feature' => $feature],
            [
                'enabled' => $validated['enabled'],
                'updated_by' => $request->user()?->id,
            ],
        );

        // The memo was populated before the write if anything else in this
        // request asked.
        Features::flush($institution->id);

        return response()->json([
            'success' => true,
            'data' => [
                'institution_id' => $institution->id,
                'feature' => $feature,
                'enabled' => Features::enabled($institution->id, $feature),
                'decided' => true,
            ],
        ]);
    }
}
