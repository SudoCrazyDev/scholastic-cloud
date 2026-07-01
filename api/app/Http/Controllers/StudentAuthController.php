<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentAuthLog;
use App\Models\User;
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
     * Every change is recorded in student_auth_logs with the acting staff user.
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

        $existing = StudentAuth::where('student_id', $student)->first();
        $oldEmail = $existing?->email;
        $newEmail = $request->email;

        $auth = StudentAuth::updateOrCreate(
            ['student_id' => $student],
            [
                'email' => $newEmail,
                'password' => Hash::make($request->password),
                'is_new' => $request->boolean('is_new', true),
            ]
        );

        // Determine what changed for the audit trail.
        if (!$existing) {
            $action = 'created';
        } elseif ($oldEmail !== $newEmail) {
            $action = 'changed_email';
        } else {
            $action = 'reset_password';
        }

        $actor = $request->user();
        StudentAuthLog::create([
            'student_id' => $student,
            'performed_by' => $actor instanceof User ? $actor->id : null,
            'performed_by_name' => $this->actorName($actor),
            'action' => $action,
            'old_email' => $oldEmail,
            'new_email' => $newEmail,
        ]);

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

    /**
     * List the portal access change history for a student.
     * GET /students/{student}/auth/logs
     */
    public function logs(string $student): JsonResponse
    {
        $logs = StudentAuthLog::with('performedBy:id,first_name,middle_name,last_name,ext_name')
            ->where('student_id', $student)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(function (StudentAuthLog $log) {
                return [
                    'id' => $log->id,
                    'action' => $log->action,
                    'old_email' => $log->old_email,
                    'new_email' => $log->new_email,
                    'performed_by' => $log->performed_by,
                    'performed_by_name' => $log->performed_by_name
                        ?? ($log->performedBy ? $this->actorName($log->performedBy) : null),
                    'created_at' => $log->created_at?->toIso8601String(),
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $logs,
        ]);
    }

    /**
     * Build a readable name for the acting user, falling back to email.
     */
    private function actorName($actor): ?string
    {
        if (!$actor instanceof User) {
            return null;
        }

        $parts = array_filter([
            $actor->first_name,
            $actor->middle_name,
            $actor->last_name,
            $actor->ext_name,
        ]);
        $name = trim(implode(' ', $parts));

        return $name !== '' ? $name : $actor->email;
    }
}
