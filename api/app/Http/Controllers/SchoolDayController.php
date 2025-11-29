<?php

namespace App\Http\Controllers;

use App\Models\SchoolDay;
use App\Models\Institution;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class SchoolDayController extends Controller
{
    /**
     * Display a listing of school days records.
     */
    public function index(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'institution_id' => 'required|uuid|exists:institutions,id',
            'academic_year' => 'nullable|string',
            'month' => 'nullable|integer|min:1|max:12',
            'year' => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $query = SchoolDay::with(['institution'])
            ->where('institution_id', $request->institution_id);

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->academic_year);
        }

        if ($request->filled('month')) {
            $query->where('month', $request->month);
        }

        if ($request->filled('year')) {
            $query->where('year', $request->year);
        }

        $schoolDays = $query->orderBy('year', 'desc')
            ->orderBy('month', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $schoolDays
        ]);
    }

    /**
     * Store a newly created school day record.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'institution_id' => 'required|uuid|exists:institutions,id',
            'academic_year' => 'required|string|max:255',
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer',
            'total_days' => 'required|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        // Check if school day record already exists
        $existing = SchoolDay::where('institution_id', $request->institution_id)
            ->where('academic_year', $request->academic_year)
            ->where('month', $request->month)
            ->where('year', $request->year)
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'School days record already exists for this institution, month, and year. Use update instead.'
            ], 409);
        }

        try {
            $schoolDay = SchoolDay::create($validator->validated());

            $schoolDay->load(['institution']);

            return response()->json([
                'success' => true,
                'message' => 'School days record created successfully',
                'data' => $schoolDay
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create school days record',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified school day record.
     */
    public function show(string $id): JsonResponse
    {
        $schoolDay = SchoolDay::with(['institution'])->find($id);

        if (!$schoolDay) {
            return response()->json([
                'success' => false,
                'message' => 'School days record not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $schoolDay
        ]);
    }

    /**
     * Update the specified school day record.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $schoolDay = SchoolDay::find($id);

        if (!$schoolDay) {
            return response()->json([
                'success' => false,
                'message' => 'School days record not found'
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'total_days' => 'required|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $schoolDay->update($validator->validated());
            $schoolDay->load(['institution']);

            return response()->json([
                'success' => true,
                'message' => 'School days record updated successfully',
                'data' => $schoolDay
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update school days record',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified school day record.
     */
    public function destroy(string $id): JsonResponse
    {
        $schoolDay = SchoolDay::find($id);

        if (!$schoolDay) {
            return response()->json([
                'success' => false,
                'message' => 'School days record not found'
            ], 404);
        }

        try {
            $schoolDay->delete();

            return response()->json([
                'success' => true,
                'message' => 'School days record deleted successfully'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete school days record',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Bulk upsert school days records for multiple months.
     */
    public function bulkUpsert(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'institution_id' => 'required|uuid|exists:institutions,id',
            'academic_year' => 'required|string|max:255',
            'year' => 'required|integer',
            'school_days' => 'required|array',
            'school_days.*.month' => 'required|integer|min:1|max:12',
            'school_days.*.total_days' => 'required|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            DB::beginTransaction();

            $institutionId = $request->institution_id;
            $academicYear = $request->academic_year;
            $year = $request->year;
            $schoolDays = $request->school_days;

            $created = [];
            $updated = [];

            foreach ($schoolDays as $schoolDayData) {
                $schoolDay = SchoolDay::updateOrCreate(
                    [
                        'institution_id' => $institutionId,
                        'academic_year' => $academicYear,
                        'month' => $schoolDayData['month'],
                        'year' => $year,
                    ],
                    [
                        'total_days' => $schoolDayData['total_days'],
                    ]
                );

                if ($schoolDay->wasRecentlyCreated) {
                    $created[] = $schoolDay;
                } else {
                    $updated[] = $schoolDay;
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'School days records saved successfully',
                'data' => [
                    'created' => count($created),
                    'updated' => count($updated),
                    'total' => count($schoolDays)
                ]
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to save school days records',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

