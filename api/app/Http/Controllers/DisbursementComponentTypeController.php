<?php

namespace App\Http\Controllers;

use App\Models\DisbursementComponentType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Component types say how a disbursement was paid out — "Cash Dispense" is the
 * seeded default. Schools add and remove their own freely, exactly like
 * disbursement types; the only rule is that the default row stays.
 */
class DisbursementComponentTypeController extends Controller
{
    private function institutionId(Request $request): ?string
    {
        return $request->user()->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');
    }

    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        // Ensure the default exists before listing: institutions created after
        // the seeding migration would otherwise have nothing to fall back to.
        DisbursementComponentType::defaultFor($institutionId);

        $types = DisbursementComponentType::where('institution_id', $institutionId)
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json(['success' => true, 'data' => $types]);
    }

    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('disbursement_component_types', 'name')->where('institution_id', $institutionId),
            ],
        ]);

        $type = DisbursementComponentType::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'is_default' => false,
        ]);

        return response()->json(['success' => true, 'data' => $type], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $type = $this->findScoped($request, $id);
        if (! $type) {
            return response()->json(['success' => false, 'message' => 'Component type not found'], 404);
        }

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('disbursement_component_types', 'name')
                    ->where('institution_id', $type->institution_id)
                    ->ignore($type->id),
            ],
        ]);

        // Renaming is allowed on the default row too; is_default, not the name,
        // is what makes it the fallback.
        $type->update(['name' => $validated['name']]);

        return response()->json(['success' => true, 'data' => $type->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $type = $this->findScoped($request, $id);
        if (! $type) {
            return response()->json(['success' => false, 'message' => 'Component type not found'], 404);
        }

        if ($type->is_default) {
            return response()->json([
                'success' => false,
                'message' => 'The default component type cannot be deleted. Rename it instead.',
            ], 422);
        }

        // Disbursements keep their record; the component reference is set to null.
        $type->delete();

        return response()->json(['success' => true, 'message' => 'Component type deleted']);
    }

    private function findScoped(Request $request, string $id): ?DisbursementComponentType
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return null;
        }

        return DisbursementComponentType::where('institution_id', $institutionId)->find($id);
    }
}
