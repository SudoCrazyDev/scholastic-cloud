<?php

namespace App\Http\Controllers;

use App\Models\DisbursementType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DisbursementTypeController extends Controller
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

        $types = DisbursementType::where('institution_id', $institutionId)
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
                Rule::unique('disbursement_types', 'name')->where('institution_id', $institutionId),
            ],
        ]);

        $type = DisbursementType::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
        ]);

        return response()->json(['success' => true, 'data' => $type], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $type = $this->findScoped($request, $id);
        if (! $type) {
            return response()->json(['success' => false, 'message' => 'Type not found'], 404);
        }

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('disbursement_types', 'name')
                    ->where('institution_id', $type->institution_id)
                    ->ignore($type->id),
            ],
        ]);

        $type->update($validated);

        return response()->json(['success' => true, 'data' => $type->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $type = $this->findScoped($request, $id);
        if (! $type) {
            return response()->json(['success' => false, 'message' => 'Type not found'], 404);
        }

        // Disbursements keep their record; the type reference is set to null.
        $type->delete();

        return response()->json(['success' => true, 'message' => 'Type deleted']);
    }

    private function findScoped(Request $request, string $id): ?DisbursementType
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return null;
        }

        return DisbursementType::where('institution_id', $institutionId)->find($id);
    }
}
