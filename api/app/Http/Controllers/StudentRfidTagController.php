<?php

namespace App\Http\Controllers;

use App\Models\StudentRfidTag;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class StudentRfidTagController extends Controller
{
    /**
     * Display a listing of RFID tags, filterable by institution_id or student_id.
     */
    public function index(Request $request): JsonResponse
    {
        $query = StudentRfidTag::with('student');

        if ($request->filled('student_id')) {
            $query->where('student_id', $request->student_id);
        }

        if ($request->filled('institution_id')) {
            $query->whereHas('student', function ($q) use ($request) {
                $q->whereHas('studentInstitutions', function ($q2) use ($request) {
                    $q2->where('institution_id', $request->institution_id);
                });
            });
        }

        $tags = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $tags,
        ]);
    }

    /**
     * Store a newly created RFID tag.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'student_id' => 'required|uuid|exists:students,id',
            'rfid_uid' => 'required|string|max:255|unique:student_rfid_tags,rfid_uid',
            'is_active' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $existing = StudentRfidTag::where('student_id', $request->student_id)->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'This student already has an RFID tag assigned. Update or remove the existing one first.',
            ], 409);
        }

        try {
            $tag = StudentRfidTag::create($validator->validated());
            $tag->load('student');

            return response()->json([
                'success' => true,
                'message' => 'RFID tag assigned successfully',
                'data' => $tag,
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to assign RFID tag',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Display the specified RFID tag.
     */
    public function show(string $id): JsonResponse
    {
        $tag = StudentRfidTag::with('student')->find($id);

        if (!$tag) {
            return response()->json([
                'success' => false,
                'message' => 'RFID tag not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $tag,
        ]);
    }

    /**
     * Update the specified RFID tag.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $tag = StudentRfidTag::find($id);

        if (!$tag) {
            return response()->json([
                'success' => false,
                'message' => 'RFID tag not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'rfid_uid' => 'sometimes|string|max:255|unique:student_rfid_tags,rfid_uid,' . $id,
            'is_active' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $tag->update($validator->validated());
            $tag->load('student');

            return response()->json([
                'success' => true,
                'message' => 'RFID tag updated successfully',
                'data' => $tag,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update RFID tag',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove the specified RFID tag.
     */
    public function destroy(string $id): JsonResponse
    {
        $tag = StudentRfidTag::find($id);

        if (!$tag) {
            return response()->json([
                'success' => false,
                'message' => 'RFID tag not found',
            ], 404);
        }

        try {
            $tag->delete();

            return response()->json([
                'success' => true,
                'message' => 'RFID tag removed successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove RFID tag',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
