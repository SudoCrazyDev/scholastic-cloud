<?php

namespace App\Http\Controllers;

use App\Models\SchoolFee;
use App\Models\SchoolFeeDefault;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SchoolFeeDefaultController extends Controller
{
    /**
     * Display a listing of school fee defaults.
     */
    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $query = SchoolFeeDefault::with('schoolFee')
            ->where('institution_id', $institutionId);

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->get('academic_year'));
        }

        if ($request->filled('grade_level')) {
            $query->where('grade_level', $request->get('grade_level'));
        }

        if ($request->filled('school_fee_id')) {
            $query->where('school_fee_id', $request->get('school_fee_id'));
        }

        $defaults = $query->orderBy('grade_level')
            ->orderBy('academic_year', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $defaults
        ]);
    }

    /**
     * Store or update a school fee default.
     */
    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'school_fee_id' => 'required|uuid|exists:school_fees,id',
            'grade_level' => 'required|string|max:255',
            'academic_year' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
        ]);

        $schoolFee = SchoolFee::where('institution_id', $institutionId)
            ->where('id', $validated['school_fee_id'])
            ->first();

        if (!$schoolFee) {
            return response()->json([
                'success' => false,
                'message' => 'School fee not found for this institution'
            ], 404);
        }

        $default = SchoolFeeDefault::updateOrCreate(
            [
                'school_fee_id' => $validated['school_fee_id'],
                'grade_level' => $validated['grade_level'],
                'academic_year' => $validated['academic_year'],
            ],
            [
                'institution_id' => $institutionId,
                'amount' => $validated['amount'],
            ]
        );

        $default->load('schoolFee');

        return response()->json([
            'success' => true,
            'message' => 'School fee default saved successfully',
            'data' => $default
        ]);
    }

    /**
     * Update the specified school fee default.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $default = SchoolFeeDefault::where('institution_id', $institutionId)->find($id);
        if (!$default) {
            return response()->json([
                'success' => false,
                'message' => 'School fee default not found'
            ], 404);
        }

        $validated = $request->validate([
            'grade_level' => 'sometimes|required|string|max:255',
            'academic_year' => 'sometimes|required|string|max:255',
            'amount' => 'sometimes|required|numeric|min:0',
        ]);

        if (isset($validated['grade_level']) || isset($validated['academic_year'])) {
            $gradeLevel = $validated['grade_level'] ?? $default->grade_level;
            $academicYear = $validated['academic_year'] ?? $default->academic_year;
            $exists = SchoolFeeDefault::where('school_fee_id', $default->school_fee_id)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->where('id', '!=', $default->id)
                ->exists();

            if ($exists) {
                return response()->json([
                    'success' => false,
                    'message' => 'A default amount already exists for this fee, grade level, and academic year'
                ], 409);
            }
        }

        $default->update($validated);
        $default->load('schoolFee');

        return response()->json([
            'success' => true,
            'message' => 'School fee default updated successfully',
            'data' => $default
        ]);
    }

    /**
     * Bulk upsert defaults for a grade level and academic year.
     */
    public function bulkUpsert(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'grade_level' => 'required|string|max:255',
            'academic_year' => 'required|string|max:255',
            'defaults' => 'required|array',
            'defaults.*.school_fee_id' => 'required|uuid|exists:school_fees,id',
            'defaults.*.amount' => 'required|numeric|min:0',
        ]);

        $feeIds = collect($validated['defaults'])->pluck('school_fee_id')->unique()->values();
        $feesCount = SchoolFee::where('institution_id', $institutionId)
            ->whereIn('id', $feeIds)
            ->count();

        if ($feesCount !== $feeIds->count()) {
            return response()->json([
                'success' => false,
                'message' => 'One or more school fees do not belong to this institution'
            ], 422);
        }

        DB::beginTransaction();
        try {
            $saved = 0;
            foreach ($validated['defaults'] as $default) {
                SchoolFeeDefault::updateOrCreate(
                    [
                        'school_fee_id' => $default['school_fee_id'],
                        'grade_level' => $validated['grade_level'],
                        'academic_year' => $validated['academic_year'],
                    ],
                    [
                        'institution_id' => $institutionId,
                        'amount' => $default['amount'],
                    ]
                );
                $saved++;
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'School fee defaults saved successfully',
                'data' => [
                    'saved' => $saved
                ]
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to save school fee defaults',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified school fee default.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $default = SchoolFeeDefault::where('institution_id', $institutionId)->find($id);
        if (!$default) {
            return response()->json([
                'success' => false,
                'message' => 'School fee default not found'
            ], 404);
        }

        $default->delete();

        return response()->json([
            'success' => true,
            'message' => 'School fee default deleted successfully'
        ]);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        return $institutionId;
    }
}
