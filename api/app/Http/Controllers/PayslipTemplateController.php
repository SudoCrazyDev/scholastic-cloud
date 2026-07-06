<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayslipTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayslipTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $templates = PayslipTemplate::where('institution_id', $institutionId)
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json(['success' => true, 'data' => $templates]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'is_default' => 'boolean',
            'paper_size' => 'nullable|string|max:50',
            'layout' => 'required|array',
            'layout.*.id' => 'required|string',
            'layout.*.type' => 'required|string',
            'layout.*.label' => 'nullable|string|max:255',
            'layout.*.content' => 'nullable|string|max:1000',
        ]);

        if (! empty($validated['is_default'])) {
            PayslipTemplate::where('institution_id', $institutionId)->update(['is_default' => false]);
        }

        $template = PayslipTemplate::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'is_default' => $validated['is_default'] ?? false,
            'paper_size' => $validated['paper_size'] ?? 'Half-Letter',
            'layout' => $validated['layout'],
            'created_by' => $request->user()?->id,
        ]);

        return response()->json(['success' => true, 'data' => $template], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $template = PayslipTemplate::where('institution_id', $institutionId)->find($id);
        if (! $template) {
            return $this->notFound();
        }

        return response()->json(['success' => true, 'data' => $template]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $template = PayslipTemplate::where('institution_id', $institutionId)->find($id);
        if (! $template) {
            return $this->notFound();
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'is_default' => 'boolean',
            'paper_size' => 'nullable|string|max:50',
            'layout' => 'sometimes|required|array',
            'layout.*.id' => 'required_with:layout|string',
            'layout.*.type' => 'required_with:layout|string',
            'layout.*.label' => 'nullable|string|max:255',
            'layout.*.content' => 'nullable|string|max:1000',
        ]);

        if (! empty($validated['is_default'])) {
            PayslipTemplate::where('institution_id', $institutionId)
                ->where('id', '!=', $id)
                ->update(['is_default' => false]);
        }

        $template->update($validated);

        return response()->json(['success' => true, 'data' => $template]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $template = PayslipTemplate::where('institution_id', $institutionId)->find($id);
        if (! $template) {
            return $this->notFound();
        }

        $template->delete();

        return response()->json(['success' => true, 'message' => 'Template deleted successfully']);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        return $institutionId;
    }

    /**
     * Payroll is restricted to the roles that see it in the sidebar —
     * salaries are too sensitive for the usual "any staff" HRIS access.
     */
    private function isPayrollManager(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return in_array((string) ($role->slug ?? ''), ['principal', 'institution-administrator'], true);
    }

    private function payrollForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'You are not allowed to manage payroll',
        ], 403);
    }

    private function noInstitution(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'User does not have any institution assigned',
        ], 400);
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Template not found',
        ], 404);
    }
}
