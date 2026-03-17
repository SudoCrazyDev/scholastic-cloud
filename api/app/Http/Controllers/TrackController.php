<?php

namespace App\Http\Controllers;

use App\Models\Track;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class TrackController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $tracks = Track::where('institution_id', $institutionId)
            ->orderBy('title')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $tracks,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255',
        ]);

        $slug = $validated['slug'] ?? Str::slug($validated['title']);

        $track = Track::create([
            'institution_id' => $institutionId,
            'title' => $validated['title'],
            'slug' => $slug,
        ]);

        return response()->json([
            'success' => true,
            'data' => $track,
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $track = Track::where('institution_id', $institutionId)->findOrFail($id);

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'slug' => 'nullable|string|max:255',
        ]);

        if (isset($validated['title']) && !isset($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['title']);
        }

        $track->update($validated);

        return response()->json([
            'success' => true,
            'data' => $track->fresh(),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $track = Track::where('institution_id', $institutionId)->findOrFail($id);
        $track->delete();

        return response()->json([
            'success' => true,
            'message' => 'Track deleted successfully',
        ]);
    }
}
