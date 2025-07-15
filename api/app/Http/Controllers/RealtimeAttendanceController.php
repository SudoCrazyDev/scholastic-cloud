<?php

namespace App\Http\Controllers;

use App\Models\RealtimeAttendance;
use Illuminate\Http\Request;

class RealtimeAttendanceController extends Controller
{
    /**
     * Display a listing of the resource.
     * Supports filtering by person_name, auth_date, auth_time, and device_name.
     */
    public function index(Request $request)
    {
        // Validate required parameters
        $request->validate([
            'auth_date' => 'required|date',
            'device_name' => 'required|string',
        ]);

        $query = RealtimeAttendance::query();

        if ($request->filled('person_name')) {
            $query->where('person_name', 'like', '%' . $request->person_name . '%');
        }
        $query->where('auth_date', $request->auth_date);
        $query->where('device_name', 'like', '%' . $request->device_name . '%');

        // Get all entries for the day/device, ordered by person_name and auth_date_time
        $attendances = $query->orderBy('person_name')
            ->orderBy('auth_date_time')
            ->get();

        $grouped = $attendances->groupBy('person_name');
        $result = [];

        foreach ($grouped as $person_name => $entries) {
            $filteredEntries = [];
            $lastTime = null;
            foreach ($entries as $entry) {
                $currentTime = strtotime($entry->auth_date_time);
                if ($lastTime !== null && ($currentTime - $lastTime) < 300) {
                    // Less than 5 minutes from previous, skip
                    continue;
                }
                $filteredEntries[] = $entry;
                $lastTime = $currentTime;
                if (count($filteredEntries) >= 4) {
                    break;
                }
            }
            // Map to check-in, break-out, break-in, check-out
            $labels = ['check-in', 'break-out', 'break-in', 'check-out'];
            $entriesArr = [];
            foreach ($filteredEntries as $i => $entry) {
                $entriesArr[] = [
                    $labels[$i] => date('g:ia', strtotime($entry->auth_date_time))
                ];
            }
            $result[] = [
                'person_name' => $person_name,
                'entries' => $entriesArr
            ];
        }

        $totalCheckIns = 0;
        $totalBreakOuts = 0;
        foreach ($result as $person) {
            foreach ($person['entries'] as $entry) {
                if (array_key_exists('check-in', $entry)) {
                    $totalCheckIns++;
                }
                if (array_key_exists('break-out', $entry)) {
                    $totalBreakOuts++;
                }
            }
        }
        return response()->json([
            'data' => $result,
            'total_check_ins' => $totalCheckIns,
            'total_break_outs' => $totalBreakOuts
        ]);
    }
} 