<?php

namespace App\Http\Controllers;

use App\Models\StudentAttendance;
use App\Models\Student;
use App\Models\ClassSection;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class StudentAttendanceController extends Controller
{
    /**
     * Display a listing of attendance records.
     */
    public function index(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'class_section_id' => 'required|uuid|exists:class_sections,id',
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

        $query = StudentAttendance::with(['student', 'classSection'])
            ->where('class_section_id', $request->class_section_id);

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->academic_year);
        }

        if ($request->filled('month')) {
            $query->where('month', $request->month);
        }

        if ($request->filled('year')) {
            $query->where('year', $request->year);
        }

        $attendances = $query->orderBy('year', 'desc')
            ->orderBy('month', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $attendances
        ]);
    }

    /**
     * Store a newly created attendance record.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'student_id' => 'required|uuid|exists:students,id',
            'class_section_id' => 'required|uuid|exists:class_sections,id',
            'academic_year' => 'required|string|max:255',
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer',
            'days_present' => 'required|integer|min:0',
            'days_absent' => 'required|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        // Check if attendance record already exists
        $existing = StudentAttendance::where('student_id', $request->student_id)
            ->where('class_section_id', $request->class_section_id)
            ->where('academic_year', $request->academic_year)
            ->where('month', $request->month)
            ->where('year', $request->year)
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record already exists for this student, month, and year. Use update instead.'
            ], 409);
        }

        try {
            $attendance = StudentAttendance::create($validator->validated());

            $attendance->load(['student', 'classSection']);

            return response()->json([
                'success' => true,
                'message' => 'Attendance record created successfully',
                'data' => $attendance
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create attendance record',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified attendance record.
     */
    public function show(string $id): JsonResponse
    {
        $attendance = StudentAttendance::with(['student', 'classSection'])->find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $attendance
        ]);
    }

    /**
     * Update the specified attendance record.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $attendance = StudentAttendance::find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found'
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'days_present' => 'required|integer|min:0',
            'days_absent' => 'required|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $attendance->update($validator->validated());
            $attendance->load(['student', 'classSection']);

            return response()->json([
                'success' => true,
                'message' => 'Attendance record updated successfully',
                'data' => $attendance
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update attendance record',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified attendance record.
     */
    public function destroy(string $id): JsonResponse
    {
        $attendance = StudentAttendance::find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found'
            ], 404);
        }

        try {
            $attendance->delete();

            return response()->json([
                'success' => true,
                'message' => 'Attendance record deleted successfully'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete attendance record',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Bulk upsert attendance records for multiple students.
     */
    public function bulkUpsert(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'class_section_id' => 'required|uuid|exists:class_sections,id',
            'academic_year' => 'required|string|max:255',
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer',
            'attendances' => 'required|array',
            'attendances.*.student_id' => 'required|uuid|exists:students,id',
            'attendances.*.days_present' => 'required|integer|min:0',
            'attendances.*.days_absent' => 'required|integer|min:0',
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

            $classSectionId = $request->class_section_id;
            $academicYear = $request->academic_year;
            $month = $request->month;
            $year = $request->year;
            $attendances = $request->attendances;

            $created = [];
            $updated = [];

            foreach ($attendances as $attendanceData) {
                $attendance = StudentAttendance::updateOrCreate(
                    [
                        'student_id' => $attendanceData['student_id'],
                        'class_section_id' => $classSectionId,
                        'academic_year' => $academicYear,
                        'month' => $month,
                        'year' => $year,
                    ],
                    [
                        'days_present' => $attendanceData['days_present'],
                        'days_absent' => $attendanceData['days_absent'],
                    ]
                );

                if ($attendance->wasRecentlyCreated) {
                    $created[] = $attendance;
                } else {
                    $updated[] = $attendance;
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Attendance records saved successfully',
                'data' => [
                    'created' => count($created),
                    'updated' => count($updated),
                    'total' => count($attendances)
                ]
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to save attendance records',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

