<?php

namespace App\Http\Controllers;

use App\Models\CoreValueMarking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class CoreValueMarkingController extends Controller
{
    // List all markings, with optional filters
    public function index(Request $request)
    {
        $query = CoreValueMarking::query();
        if ($request->has('student_ids')) {
            $studentIds = $request->input('student_ids');
            if (is_string($studentIds)) {
                // If sent as comma-separated string
                $studentIds = explode(',', $studentIds);
            }
            $query->whereIn('student_id', $studentIds);
        } elseif ($request->has('student_id')) {
            $query->where('student_id', $request->student_id);
        }
        if ($request->has('quarter')) {
            $query->where('quarter', $request->quarter);
        }
        if ($request->has('academic_year')) {
            $query->where('academic_year', $request->academic_year);
        }
        $markings = $query->get();
        return response()->json(['data' => $markings]);
    }

    // Store a new marking
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'student_id' => 'required|uuid|exists:students,id',
            'quarter' => 'required|string',
            'core_value' => 'required|string',
            'behavior_statement' => 'required|string',
            'marking' => 'required|in:AO,SO,RO,NO',
            'academic_year' => 'required|string',
        ]);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }
        $data = $validator->validated();
        $marking = CoreValueMarking::updateOrCreate(
            [
                'student_id' => $data['student_id'],
                'quarter' => $data['quarter'],
                'core_value' => $data['core_value'],
                'behavior_statement' => $data['behavior_statement'],
                'academic_year' => $data['academic_year'],
            ],
            ['marking' => $data['marking']]
        );
        return response()->json(['success' => true, 'data' => $marking], 201);
    }

    // Show a single marking
    public function show($id)
    {
        $marking = CoreValueMarking::findOrFail($id);
        return response()->json(['success' => true, 'data' => $marking]);
    }

    // Update a marking
    public function update(Request $request, $id)
    {
        $marking = CoreValueMarking::findOrFail($id);
        $validator = Validator::make($request->all(), [
            'quarter' => 'sometimes|string',
            'core_value' => 'sometimes|string',
            'behavior_statement' => 'sometimes|string',
            'marking' => 'sometimes|in:AO,SO,RO,NO',
            'academic_year' => 'sometimes|string',
        ]);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }
        $marking->update($validator->validated());
        return response()->json(['success' => true, 'data' => $marking]);
    }

    // Delete a marking
    public function destroy($id)
    {
        $marking = CoreValueMarking::findOrFail($id);
        $marking->delete();
        return response()->json(['success' => true]);
    }
} 