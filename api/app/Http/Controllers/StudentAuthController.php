<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\StudentAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * Manage student_auth (email/password) for student portal login.
 * Only staff (User) should call these endpoints.
 */
class StudentAuthController extends Controller
{
    /**
     * Create or update login credentials for a student.
     * POST /students/{student}/auth with email, password, is_new (optional).
     */
    public function store(Request $request, string $student): JsonResponse
    {
        $request->validate([
            'email' => [
                'required',
                'email',
                Rule::unique('student_auth', 'email')->ignore($student, 'student_id'),
            ],
            'password' => 'required|string|min:6',
            'is_new' => 'sometimes|boolean',
        ]);

        $studentModel = Student::find($student);
        if (!$studentModel) {
            return response()->json(['message' => 'Student not found'], 404);
        }

        $auth = StudentAuth::updateOrCreate(
            ['student_id' => $student],
            [
                'email' => $request->email,
                'password' => Hash::make($request->password),
                'is_new' => $request->boolean('is_new', true),
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Student login credentials saved.',
            'data' => [
                'student_id' => $auth->student_id,
                'email' => $auth->email,
                'is_new' => $auth->is_new,
            ],
        ]);
    }

    /**
     * Get student auth info (email, is_new only; no password).
     */
    public function show(string $student): JsonResponse
    {
        $auth = StudentAuth::where('student_id', $student)->first();
        if (!$auth) {
            return response()->json(['message' => 'No login credentials for this student'], 404);
        }
        return response()->json([
            'success' => true,
            'data' => [
                'student_id' => $auth->student_id,
                'email' => $auth->email,
                'is_new' => $auth->is_new,
            ],
        ]);
    }
}
