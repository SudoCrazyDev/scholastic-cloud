<?php

namespace App\Http\Controllers;

use App\Models\ClassSection;
use App\Models\RfidScanLog;
use App\Models\Student;
use App\Models\StudentRfidTag;
use App\Models\StudentSection;
use App\Services\GateSmsNotifier;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

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
            'search' => 'nullable|string|max:255',
            'date' => 'nullable|date',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'datetime_from' => 'nullable|date',
            'datetime_to' => 'nullable|date',
            'type' => 'nullable|in:enter,exit',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:200',
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

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->whereHas('student', function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('lrn', 'like', "%{$search}%")
                    ->orWhereRaw("CONCAT_WS(' ', first_name, middle_name, last_name) LIKE ?", ["%{$search}%"]);
            });
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

        // Full timestamp bounds — lets the UI narrow a range down to the minute.
        if ($request->filled('datetime_from')) {
            $query->where('scanned_at', '>=', Carbon::parse($request->datetime_from));
        }

        if ($request->filled('datetime_to')) {
            $query->where('scanned_at', '<=', Carbon::parse($request->datetime_to));
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        $perPage = (int) $request->input('per_page', 25);
        $logs = $query->orderBy('scanned_at', 'desc')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $logs->items(),
            'pagination' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
        ]);
    }

    /**
     * Daily gate attendance for one class section.
     *
     * Returns every active student of the section for the given day with their
     * first entrance scan, last exit scan and total scan count, so an adviser
     * can see who actually showed up without reading the raw log.
     */
    public function classSectionDaily(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'class_section_id' => 'required|uuid|exists:class_sections,id',
            'date' => 'required|date',
            'search' => 'nullable|string|max:255',
            'tz_offset' => 'nullable|integer|between:-840,840',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $section = ClassSection::find($request->class_section_id);
        $date = Carbon::parse($request->date)->toDateString();

        // Scans are stored in UTC but a school day is a local-wall-clock day.
        // tz_offset is the viewer's JS getTimezoneOffset() (minutes behind UTC),
        // so adding it to the UTC midnight gives the local day's real UTC window.
        $tzOffset = (int) $request->input('tz_offset', 0);
        $dayStart = Carbon::parse($date, 'UTC')->startOfDay()->addMinutes($tzOffset);
        $dayEnd = $dayStart->copy()->addDay();

        $studentsQuery = Student::whereHas('studentSections', function ($q) use ($section) {
            $q->where('section_id', $section->id)
                ->where('is_active', true);
        });

        if ($request->filled('search')) {
            $search = trim($request->search);
            $studentsQuery->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('lrn', 'like', "%{$search}%")
                    ->orWhereRaw("CONCAT_WS(' ', first_name, middle_name, last_name) LIKE ?", ["%{$search}%"]);
            });
        }

        $students = $studentsQuery
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'middle_name', 'last_name', 'lrn', 'gender']);

        $logs = RfidScanLog::where('institution_id', $section->institution_id)
            ->whereIn('student_id', $students->pluck('id'))
            ->where('scanned_at', '>=', $dayStart)
            ->where('scanned_at', '<', $dayEnd)
            ->orderBy('scanned_at')
            ->get(['id', 'student_id', 'scanned_at', 'type', 'device_name'])
            ->groupBy('student_id');

        $rows = $students->map(function ($student) use ($logs) {
            $studentLogs = $logs->get($student->id, collect());
            $firstIn = $studentLogs->firstWhere('type', 'enter');
            $lastOut = $studentLogs->where('type', 'exit')->last();

            return [
                'student' => $student,
                'first_in' => $firstIn?->scanned_at?->toIso8601String(),
                'last_out' => $lastOut?->scanned_at?->toIso8601String(),
                'scan_count' => $studentLogs->count(),
                'status' => $studentLogs->isEmpty() ? 'absent' : 'present',
                'logs' => $studentLogs->values(),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $rows->values(),
            'summary' => [
                'date' => $date,
                'total_students' => $students->count(),
                'present' => $rows->where('status', 'present')->count(),
                'absent' => $rows->where('status', 'absent')->count(),
            ],
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

            app(GateSmsNotifier::class)->notify($log);

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
     * Public kiosk scan endpoint — no auth required.
     * Used by gate-enter / gate-exit kiosk pages.
     * Accepts a forced type so each gate always records the correct direction.
     */
    public function kioskScan(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'rfid_uid' => 'required|string|max:255',
            'institution_id' => 'required|uuid|exists:institutions,id',
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

        $tag = StudentRfidTag::where('rfid_uid', $request->rfid_uid)
            ->where('is_active', true)
            ->first();

        $studentId = $tag?->student_id;
        $tagId = $tag?->id;

        // Fallback: the scanned value may be a student ID QR code (the raw
        // student UUID) rather than an RFID tag UID. Resolve the student
        // directly, but only if they are an active member of the scanning
        // institution, and link their active RFID tag if they have one.
        if (!$studentId && Str::isUuid($request->rfid_uid)) {
            $student = Student::where('id', $request->rfid_uid)
                ->where('is_active', true)
                ->whereHas('studentInstitutions', function ($query) use ($request) {
                    $query->where('institution_id', $request->institution_id)
                        ->where('is_active', true);
                })
                ->first();

            if ($student) {
                $studentId = $student->id;
                $tagId = $student->rfidTag()->where('is_active', true)->value('id');
            }
        }

        if (!$studentId) {
            return response()->json([
                'success' => false,
                'message' => 'RFID tag not recognized or inactive',
            ], 404);
        }

        try {
            $log = RfidScanLog::create([
                'student_rfid_tag_id' => $tagId,
                'student_id' => $studentId,
                'institution_id' => $request->institution_id,
                'scanned_at' => now(),
                'type' => $request->type,
                'device_name' => $request->device_name,
            ]);

            $log->load(['student', 'studentRfidTag', 'institution']);

            // Best-effort: queues the parent/guardian SMS if this gate has one configured.
            // Never blocks or fails the scan — the kiosk must stay responsive.
            app(GateSmsNotifier::class)->notify($log);

            $activeSection = StudentSection::with('classSection')
                ->where('student_id', $studentId)
                ->where('is_active', true)
                ->latest()
                ->first();

            $response = $log->toArray();
            $response['class_section'] = $activeSection?->classSection;

            return response()->json([
                'success' => true,
                'message' => 'Scan recorded — ' . $request->type,
                'data' => $response,
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
