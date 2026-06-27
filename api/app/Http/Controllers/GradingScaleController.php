<?php

namespace App\Http\Controllers;

use App\Models\GradingScale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class GradingScaleController extends Controller
{
    private const MANAGE_ROLES = ['super-administrator', 'principal', 'institution-administrator'];

    private function canManage(Request $request): bool
    {
        $slug = $request->user()?->role?->slug;

        return $slug && in_array($slug, self::MANAGE_ROLES, true);
    }

    private function institutionId(Request $request): ?string
    {
        return $request->user()
            ->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');
    }

    /**
     * List grading scales for the user's default institution.
     */
    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);

        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $scales = GradingScale::with('bands')
            ->where('institution_id', $institutionId)
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $scales,
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);

        $scale = GradingScale::with('bands')
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $scale) {
            return response()->json(['success' => false, 'message' => 'Grading scale not found'], 404);
        }

        return response()->json(['success' => true, 'data' => $scale]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->canManage($request)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to manage grading scales.',
            ], 403);
        }

        $institutionId = $this->institutionId($request);

        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        try {
            $validated = $this->validatePayload($request);

            $scale = DB::transaction(function () use ($validated, $institutionId) {
                $scale = GradingScale::create([
                    'institution_id' => $institutionId,
                    'name' => $validated['name'],
                    'description' => $validated['description'] ?? null,
                ]);

                $this->syncBands($scale, $validated['bands']);

                return $scale;
            });

            return response()->json([
                'success' => true,
                'message' => 'Grading scale created successfully',
                'data' => $scale->load('bands'),
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        }
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (! $this->canManage($request)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to manage grading scales.',
            ], 403);
        }

        $institutionId = $this->institutionId($request);

        $scale = GradingScale::where('institution_id', $institutionId)->find($id);

        if (! $scale) {
            return response()->json(['success' => false, 'message' => 'Grading scale not found'], 404);
        }

        try {
            $validated = $this->validatePayload($request);

            DB::transaction(function () use ($scale, $validated) {
                $scale->update([
                    'name' => $validated['name'],
                    'description' => $validated['description'] ?? null,
                ]);

                $scale->bands()->delete();
                $this->syncBands($scale, $validated['bands']);
            });

            return response()->json([
                'success' => true,
                'message' => 'Grading scale updated successfully',
                'data' => $scale->fresh('bands'),
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        }
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if (! $this->canManage($request)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to manage grading scales.',
            ], 403);
        }

        $institutionId = $this->institutionId($request);

        $scale = GradingScale::where('institution_id', $institutionId)->find($id);

        if (! $scale) {
            return response()->json(['success' => false, 'message' => 'Grading scale not found'], 404);
        }

        $scale->delete();

        return response()->json([
            'success' => true,
            'message' => 'Grading scale deleted successfully',
        ]);
    }

    /**
     * @return array{name: string, description?: string|null, bands: array<int, array<string, mixed>>}
     */
    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'bands' => 'required|array|min:1',
            'bands.*.label' => 'required|string|max:50',
            'bands.*.min_score' => 'required|numeric|min:0|max:100',
            'bands.*.max_score' => 'required|numeric|min:0|max:100|gte:bands.*.min_score',
        ]);
    }

    private function syncBands(GradingScale $scale, array $bands): void
    {
        foreach (array_values($bands) as $index => $band) {
            $scale->bands()->create([
                'label' => $band['label'],
                'min_score' => $band['min_score'],
                'max_score' => $band['max_score'],
                'sort_order' => $index,
            ]);
        }
    }
}
