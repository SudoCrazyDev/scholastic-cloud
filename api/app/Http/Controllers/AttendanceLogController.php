<?php

namespace App\Http\Controllers;

use App\Models\AttendanceLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AttendanceLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $institutionId = $request->user()->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');

        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $query = AttendanceLog::where('institution_id', $institutionId)
            ->with(['user', 'device']);

        if ($request->filled('device_id')) {
            $query->where('device_id', $request->get('device_id'));
        }
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->get('user_id'));
        }
        if ($request->filled('date')) {
            $query->whereDate('punched_at', $request->get('date'));
        }
        if ($request->filled('from')) {
            $from = $request->get('from');
            // A date-only value (YYYY-MM-DD) means "from the start of that day".
            $query->where('punched_at', '>=', strlen($from) === 10 ? "{$from} 00:00:00" : $from);
        }
        if ($request->filled('to')) {
            $to = $request->get('to');
            // A date-only value means "through the end of that day" (inclusive).
            $query->where('punched_at', '<=', strlen($to) === 10 ? "{$to} 23:59:59" : $to);
        }

        $perPage = $request->get('per_page', 50);
        $logs = $query->orderByDesc('punched_at')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $logs->items(),
            'pagination' => [
                'current_page' => $logs->currentPage(),
                'last_page'    => $logs->lastPage(),
                'per_page'     => $logs->perPage(),
                'total'        => $logs->total(),
            ],
        ]);
    }
}
