<?php

namespace App\Http\Controllers;

use App\Models\RfidScanLog;
use App\Models\StudentRfidTag;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class RfidScanLogController extends Controller
{
    /**
     * Display a listing of scan logs, filterable by institution, student, date range.
     */
    public function index(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'institution_id' => 'required|uuid|exists:institutions,id',
            'student_id' => 'nullable|uuid|exists:students,id',
            'date' => 'nullable|date',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'type' => 'nullable|in:enter,exit',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $query = RfidScanLog::with(['student', 'studentRfidTag', 'institution'])
            ->where('institution_id', $request->institution_id);

        if ($request->filled('student_id')) {
            $query->where('student_id', $request->student_id);
        }

        if ($request->filled('date')) {
            $query->whereDate('scanned_at', $request->date);
        }

        if ($request->filled('date_from')) {
            $query->whereDate('scanned_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('scanned_at', '<=', $request->date_to);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        $logs = $query->orderBy('scanned_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $logs,
        ]);
    }

    /**
     * Record a new scan from an RFID reader device.
     * Accepts the raw rfid_uid and resolves the student automatically.
     */
    public function scan(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'rfid_uid' => 'required|string|max:255',
            'institution_id' => 'required|uuid|exists:institutions,id',
            'device_name' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $tag = StudentRfidTag::where('rfid_uid', $request->rfid_uid)
            ->where('is_active', true)
            ->first();

        if (!$tag) {
            return response()->json([
                'success' => false,
                'message' => 'RFID tag not recognized or inactive',
            ], 404);
        }

        $lastLog = RfidScanLog::where('student_id', $tag->student_id)
            ->where('institution_id', $request->institution_id)
            ->whereDate('scanned_at', now()->toDateString())
            ->orderBy('scanned_at', 'desc')
            ->first();

        $type = (!$lastLog || $lastLog->type === 'exit') ? 'enter' : 'exit';

        try {
            $log = RfidScanLog::create([
                'student_rfid_tag_id' => $tag->id,
                'student_id' => $tag->student_id,
                'institution_id' => $request->institution_id,
                'scanned_at' => now(),
                'type' => $type,
                'device_name' => $request->device_name,
            ]);

            $log->load(['student', 'studentRfidTag']);

            return response()->json([
                'success' => true,
                'message' => 'Scan recorded — ' . $type,
                'data' => $log,
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to record scan',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Store a scan log entry manually (admin use).
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'student_rfid_tag_id' => 'required|uuid|exists:student_rfid_tags,id',
            'student_id' => 'required|uuid|exists:students,id',
            'institution_id' => 'required|uuid|exists:institutions,id',
            'scanned_at' => 'required|date',
            'type' => 'required|in:enter,exit',
            'device_name' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $log = RfidScanLog::create($validator->validated());
            $log->load(['student', 'studentRfidTag', 'institution']);

            return response()->json([
                'success' => true,
                'message' => 'Scan log created successfully',
                'data' => $log,
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create scan log',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Display the specified scan log.
     */
    public function show(string $id): JsonResponse
    {
        $log = RfidScanLog::with(['student', 'studentRfidTag', 'institution'])->find($id);

        if (!$log) {
            return response()->json([
                'success' => false,
                'message' => 'Scan log not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $log,
        ]);
    }

    /**
     * Remove the specified scan log.
     */
    public function destroy(string $id): JsonResponse
    {
        $log = RfidScanLog::find($id);

        if (!$log) {
            return response()->json([
                'success' => false,
                'message' => 'Scan log not found',
            ], 404);
        }

        try {
            $log->delete();

            return response()->json([
                'success' => true,
                'message' => 'Scan log deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete scan log',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
