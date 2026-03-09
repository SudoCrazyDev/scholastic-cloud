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
     * Parse academic year string (e.g. "2025-2026") into [startYear, endYear].
     * Academic year runs Jun (startYear) through May (endYear).
     */
    private function parseAcademicYear(string $academicYear): ?array
    {
        if (preg_match('/^(\d{4})-(\d{4})$/', trim($academicYear), $m)) {
            $start = (int) $m[1];
            $end = (int) $m[2];
            if ($end === $start + 1) {
                return [$start, $end];
            }
        }
        return null;
    }

    /**
     * For a given month (1-12) and academic year (e.g. 2025-2026), return the calendar year.
     * Jun (6) - May (5) => months 6-12 use start year, months 1-5 use end year.
     */
    private function yearForMonthInAcademicYear(int $month, string $academicYear): ?int
    {
        $parsed = $this->parseAcademicYear($academicYear);
        if (!$parsed) {
            return null;
        }
        [$startYear, $endYear] = $parsed;
        return $month >= 6 ? $startYear : $endYear;
    }

    /**
     * Display a listing of school days records.
     * When academic_year is provided, returns exactly 12 rows (one per month) in academic order
     * (Jun, Jul, ..., Dec, Jan, ..., May), with year derived from academic year. No separate year filter.
     */
    public function index(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'institution_id' => 'required|uuid|exists:institutions,id',
            'department_id' => 'nullable|uuid|exists:departments,id',
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

        $query = SchoolDay::with(['institution', 'department'])
            ->where('institution_id', $request->institution_id);

        if ($request->filled('department_id')) {
            $query->where('department_id', $request->department_id);
        }

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

        // When filtering by academic_year only: return exactly 12 rows (one per month) in academic
        // order (Jun→May). Prefer rows whose year matches the academic year; fill missing months with 0.
        if ($request->filled('academic_year') && !$request->filled('month') && !$request->filled('year')) {
            $parsed = $this->parseAcademicYear($request->academic_year);
            if ($parsed) {
                [$startYear, $endYear] = $parsed;
                $byMonth = [];
                foreach ($schoolDays as $row) {
                    $m = (int) $row->month;
                    $expectedYear = $m >= 6 ? $startYear : $endYear;
                    if (!isset($byMonth[$m]) || (int) $row->year === $expectedYear) {
                        $byMonth[$m] = $row;
                    }
                }
                $academicOrder = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
                $result = [];
                foreach ($academicOrder as $month) {
                    $expectedYear = $month >= 6 ? $startYear : $endYear;
                    if (isset($byMonth[$month])) {
                        $result[] = $byMonth[$month];
                    } else {
                        $result[] = (object) [
                            'id' => null,
                            'institution_id' => $request->institution_id,
                            'department_id' => $request->department_id,
                            'academic_year' => $request->academic_year,
                            'month' => $month,
                            'year' => $expectedYear,
                            'total_days' => 0,
                        ];
                    }
                }
                return response()->json([
                    'success' => true,
                    'data' => $result
                ]);
            }
        }

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
            'department_id' => 'nullable|uuid|exists:departments,id',
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
            ->where('department_id', $request->department_id)
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
        $schoolDay = SchoolDay::with(['institution', 'department'])->find($id);

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
     * Bulk upsert school days records for all 12 months of an academic year.
     * Calendar year is derived from academic year: Jun–Dec = start year, Jan–May = end year.
     */
    public function bulkUpsert(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'institution_id' => 'required|uuid|exists:institutions,id',
            'department_id' => 'nullable|uuid|exists:departments,id',
            'academic_year' => 'required|string|max:255',
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

        $parsed = $this->parseAcademicYear($request->academic_year);
        if (!$parsed) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid academic year format. Use e.g. 2025-2026.',
                'errors' => ['academic_year' => ['Must be in format YYYY-YYYY (e.g. 2025-2026).']]
            ], 422);
        }

        try {
            DB::beginTransaction();

            $institutionId = $request->institution_id;
            $departmentId = $request->department_id ?? null;
            $academicYear = $request->academic_year;
            $schoolDays = $request->school_days;

            $created = [];
            $updated = [];

            // Derive calendar year per month: Jun–Dec = start year, Jan–May = end year of academic year.
            foreach ($schoolDays as $schoolDayData) {
                $month = (int) $schoolDayData['month'];
                $year = $this->yearForMonthInAcademicYear($month, $academicYear);
                if ($year === null) {
                    continue;
                }

                $schoolDay = SchoolDay::updateOrCreate(
                    [
                        'institution_id' => $institutionId,
                        'department_id' => $departmentId,
                        'academic_year' => $academicYear,
                        'month' => $month,
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

