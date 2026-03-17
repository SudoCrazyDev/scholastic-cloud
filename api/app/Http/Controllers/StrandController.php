<?php

namespace App\Http\Controllers;

use App\Models\Strand;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class StrandController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $query = Strand::where('institution_id', $institutionId)
            ->with('track');

        if ($request->filled('track_id')) {
            $query->where('track_id', $request->track_id);
        }

        $strands = $query->orderBy('title')->get();

        return response()->json([
            'success' => true,
            'data' => $strands,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $validated = $request->validate([
            'track_id' => 'required|uuid|exists:tracks,id',
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255',
        ]);

        $slug = $validated['slug'] ?? Str::slug($validated['title']);

        $strand = Strand::create([
            'institution_id' => $institutionId,
            'track_id' => $validated['track_id'],
            'title' => $validated['title'],
            'slug' => $slug,
        ]);

        return response()->json([
            'success' => true,
            'data' => $strand->load('track'),
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $strand = Strand::where('institution_id', $institutionId)->findOrFail($id);

        $validated = $request->validate([
            'track_id' => 'sometimes|uuid|exists:tracks,id',
            'title' => 'sometimes|string|max:255',
            'slug' => 'nullable|string|max:255',
        ]);

        if (isset($validated['title']) && !isset($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['title']);
        }

        $strand->update($validated);

        return response()->json([
            'success' => true,
            'data' => $strand->fresh()->load('track'),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $strand = Strand::where('institution_id', $institutionId)->findOrFail($id);
        $strand->delete();

        return response()->json([
            'success' => true,
            'message' => 'Strand deleted successfully',
        ]);
    }
}
