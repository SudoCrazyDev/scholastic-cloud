<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\ReceiptTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReceiptTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $templates = ReceiptTemplate::where('institution_id', $institutionId)
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json(['success' => true, 'data' => $templates]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'is_default' => 'boolean',
            'paper_size' => 'nullable|string|max:50',
            'layout' => 'required|array',
            'layout.*.id' => 'required|string',
            'layout.*.type' => 'required|string',
        ]);

        if (! empty($validated['is_default'])) {
            ReceiptTemplate::where('institution_id', $institutionId)->update(['is_default' => false]);
        }

        $template = ReceiptTemplate::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'is_default' => $validated['is_default'] ?? false,
            'paper_size' => $validated['paper_size'] ?? '80mm',
            'layout' => $validated['layout'],
            'created_by' => $request->user()?->id,
        ]);

        return response()->json(['success' => true, 'data' => $template], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $template = ReceiptTemplate::where('institution_id', $institutionId)->find($id);
        if (! $template) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        return response()->json(['success' => true, 'data' => $template]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $template = ReceiptTemplate::where('institution_id', $institutionId)->find($id);
        if (! $template) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'is_default' => 'boolean',
            'paper_size' => 'nullable|string|max:50',
            'layout' => 'sometimes|required|array',
        ]);

        if (! empty($validated['is_default'])) {
            ReceiptTemplate::where('institution_id', $institutionId)
                ->where('id', '!=', $id)
                ->update(['is_default' => false]);
        }

        $template->update($validated);

        return response()->json(['success' => true, 'data' => $template]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $template = ReceiptTemplate::where('institution_id', $institutionId)->find($id);
        if (! $template) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $template->delete();

        return response()->json(['success' => true, 'message' => 'Deleted']);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $first = $user->userInstitutions()->first();
            if ($first) {
                $institutionId = $first->institution_id;
            }
        }

        return $institutionId;
    }

    private function isStudentUser(Request $request): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }
        if ($user instanceof StudentPortalUser) {
            return true;
        }
        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'student';
    }
}
