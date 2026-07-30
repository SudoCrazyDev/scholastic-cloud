<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentAdditionalFeeController extends Controller
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

        $validated = $request->validate([
            'student_id' => 'required|uuid|exists:students,id',
            'academic_year' => 'nullable|string|max:255',
            'with_waived' => 'nullable|boolean',
        ]);

        $query = StudentAdditionalFee::with('waivedBy')
            ->where('institution_id', $institutionId)
            ->where('student_id', $validated['student_id']);

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->get('academic_year'));
        }

        // Waived charges are hidden by default. The ledger asks for them so finance can see
        // what was written off — and restore it when a delete was not meant as a waiver.
        if ($request->boolean('with_waived')) {
            $query->withTrashed();
        }

        $fees = $query->orderBy('created_at', 'desc')->get()->map(function ($fee) {
            $data = $fee->toArray();
            $waivedBy = $fee->waivedBy;
            $data['waived_by_name'] = $waivedBy
                ? trim(($waivedBy->first_name ?? '') . ' ' . ($waivedBy->last_name ?? ''))
                : null;

            return $data;
        });

        return response()->json([
            'success' => true,
            'data' => $fees,
        ]);
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
            'student_id' => 'required|uuid|exists:students,id',
            'student_fee_id' => 'nullable|uuid|exists:student_fees,id',
            'academic_year' => 'required|string|max:255',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'amount' => 'required|numeric|min:0.01',
        ]);

        $student = Student::whereHas('studentInstitutions', function ($q) use ($institutionId) {
            $q->where('institution_id', $institutionId);
        })->find($validated['student_id']);

        if (! $student) {
            return response()->json(['success' => false, 'message' => 'Student not found in this institution'], 404);
        }

        $fee = StudentAdditionalFee::create([
            'institution_id' => $institutionId,
            'student_id' => $validated['student_id'],
            'student_fee_id' => $validated['student_fee_id'] ?? null,
            'academic_year' => $validated['academic_year'],
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'amount' => $validated['amount'],
            'created_by' => $request->user()?->id,
        ]);

        return response()->json(['success' => true, 'data' => $fee], 201);
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

        $fee = StudentAdditionalFee::where('institution_id', $institutionId)->find($id);
        if (! $fee) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'amount' => 'sometimes|required|numeric|min:0.01',
        ]);

        $fee->update($validated);

        return response()->json(['success' => true, 'data' => $fee]);
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

        $fee = StudentAdditionalFee::where('institution_id', $institutionId)->find($id);
        if (! $fee) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        // Waiving a late fee permanently forgives that installment's surcharge, so the
        // reason is required — an ad-hoc fee can still be removed without one.
        $validated = $request->validate([
            'note' => ($fee->isLateFee() ? 'required' : 'nullable') . '|string|max:255',
        ]);

        // Stamp the audit fields before deleting: once the row is trashed the ordinary
        // query scope hides it, so this is the only chance to say who did it and why.
        $fee->forceFill([
            'deleted_by' => $request->user()?->id,
            'waive_note' => $validated['note'] ?? null,
        ])->save();

        // Soft delete: for an auto-charged late fee this records the waiver, which is
        // what stops the next ledger load from charging that installment again.
        $fee->delete();

        return response()->json([
            'success' => true,
            'message' => $fee->isLateFee() ? 'Late fee waived' : 'Deleted',
        ]);
    }

    /**
     * Un-waive a charge.
     *
     * A waived late fee is otherwise unrecoverable: `LateFeeService` counts trashed rows as
     * already handled, so the installment is never re-charged and no UI action could bring
     * the money back. Restoring clears the audit stamp and returns the row to the ledger at
     * the amount originally booked.
     */
    public function restore(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $fee = StudentAdditionalFee::onlyTrashed()
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $fee) {
            return response()->json(['success' => false, 'message' => 'No waived fee to restore'], 404);
        }

        $fee->restore();
        $fee->forceFill(['deleted_by' => null, 'waive_note' => null])->save();

        return response()->json([
            'success' => true,
            'message' => $fee->isLateFee() ? 'Late fee restored' : 'Fee restored',
            'data' => $fee,
        ]);
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
