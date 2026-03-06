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
        ]);

        $query = StudentAdditionalFee::where('institution_id', $institutionId)
            ->where('student_id', $validated['student_id']);

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->get('academic_year'));
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderBy('created_at', 'desc')->get(),
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

        $fee->delete();

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
