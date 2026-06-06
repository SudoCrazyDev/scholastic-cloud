<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PaymentPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PaymentPlanController extends Controller
{
    /**
     * List payment plan definitions for the current institution.
     */
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $query = PaymentPlan::with('installments')->where('institution_id', $institutionId);

        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->get('search').'%');
        }

        if ($request->filled('is_active')) {
            $isActive = filter_var($request->get('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($isActive !== null) {
                $query->where('is_active', $isActive);
            }
        }

        $plans = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $plans->map(fn ($plan) => $this->serialize($plan))->values(),
        ]);
    }

    /**
     * Create a new payment plan definition with its installment templates.
     */
    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $this->validatePayload($request, $institutionId);

        $plan = DB::transaction(function () use ($validated, $institutionId, $request) {
            $plan = PaymentPlan::create([
                'institution_id' => $institutionId,
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
                'sort_order' => $validated['sort_order'] ?? 0,
                'created_by' => $request->user()?->id,
            ]);

            $this->syncInstallments($plan, $validated['installments']);

            return $plan;
        });

        return response()->json([
            'success' => true,
            'message' => 'Payment plan created successfully',
            'data' => $this->serialize($plan->fresh('installments')),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $plan = PaymentPlan::with('installments')
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $plan) {
            return $this->notFound();
        }

        return response()->json([
            'success' => true,
            'data' => $this->serialize($plan),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $plan = PaymentPlan::with('installments')
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $plan) {
            return $this->notFound();
        }

        $validated = $this->validatePayload($request, $institutionId, $plan->id);

        DB::transaction(function () use ($plan, $validated) {
            $plan->update([
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'is_active' => $validated['is_active'] ?? $plan->is_active,
                'sort_order' => $validated['sort_order'] ?? $plan->sort_order,
            ]);

            $this->syncInstallments($plan, $validated['installments']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Payment plan updated successfully',
            'data' => $this->serialize($plan->fresh('installments')),
        ]);
    }

    /**
     * Delete a plan. Plans already chosen by students cannot be hard-deleted
     * (the historical reference must survive) — disable them instead.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $plan = PaymentPlan::where('institution_id', $institutionId)->find($id);
        if (! $plan) {
            return $this->notFound();
        }

        if ($plan->studentSelections()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'This plan has been selected by students and cannot be deleted. Disable it instead.',
            ], 409);
        }

        $plan->delete();

        return response()->json([
            'success' => true,
            'message' => 'Payment plan deleted successfully',
        ]);
    }

    private function validatePayload(Request $request, string $institutionId, ?string $ignoreId = null): array
    {
        return $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('payment_plans')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId))
                    ->ignore($ignoreId),
            ],
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer|min:0',
            'installments' => 'required|array|min:1',
            'installments.*.label' => 'nullable|string|max:255',
            'installments.*.due_month' => 'required|integer|min:1|max:12',
            'installments.*.due_day' => 'required|integer|min:1|max:31',
            'installments.*.share_percentage' => 'nullable|numeric|min:0|max:100',
        ]);
    }

    private function syncInstallments(PaymentPlan $plan, array $installments): void
    {
        // Templates are fully replaced on every write — simplest correct behaviour
        // for the custom-schedule editor.
        $plan->installments()->delete();

        $sequence = 1;
        $rows = [];
        foreach ($installments as $installment) {
            $rows[] = [
                'sequence' => $sequence++,
                'label' => ($installment['label'] ?? '') !== '' ? $installment['label'] : null,
                'due_month' => (int) $installment['due_month'],
                'due_day' => (int) $installment['due_day'],
                'share_percentage' => isset($installment['share_percentage']) && $installment['share_percentage'] !== ''
                    ? (float) $installment['share_percentage']
                    : null,
            ];
        }

        $plan->installments()->createMany($rows);
    }

    private function serialize(PaymentPlan $plan): array
    {
        return [
            'id' => $plan->id,
            'institution_id' => $plan->institution_id,
            'name' => $plan->name,
            'description' => $plan->description,
            'is_active' => (bool) $plan->is_active,
            'sort_order' => (int) $plan->sort_order,
            'installment_count' => $plan->installments->count(),
            'installments' => $plan->installments
                ->sortBy('sequence')
                ->map(fn ($installment) => [
                    'id' => $installment->id,
                    'sequence' => (int) $installment->sequence,
                    'label' => $installment->label,
                    'due_month' => (int) $installment->due_month,
                    'due_day' => (int) $installment->due_day,
                    'share_percentage' => $installment->share_percentage !== null
                        ? (float) $installment->share_percentage
                        : null,
                ])
                ->values(),
            'created_at' => $plan->created_at?->toIso8601String(),
            'updated_at' => $plan->updated_at?->toIso8601String(),
        ];
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

    private function studentForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Students are not allowed to manage payment plans',
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
            'message' => 'Payment plan not found',
        ], 404);
    }
}
