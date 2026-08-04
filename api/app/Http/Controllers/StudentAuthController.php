<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
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
 *
 * Only staff holding the students module may call these endpoints, and only
 * for students in their own institution(s). This used to be a comment rather
 * than a check, which let any authenticated caller — including a signed-in
 * student — overwrite any other student's portal credentials and take over
 * the account, in any institution.
 */
class StudentAuthController extends Controller
{
    use AuthorizesModuleAccess;

    /**
     * Deny unless the caller is staff who may manage this particular student.
     *
     * Institution membership is checked against the student's own enrolments,
     * so a school can only ever reach its own students. Super-administrators
     * hold the wildcard and are intentionally unscoped.
     */
    private function denyUnlessManagesStudent(Request $request, string $studentId, string $ability): ?JsonResponse
    {
        if ($deny = $this->denyUnlessModule($request, 'students', $ability)) {
            return $deny;
        }

        return $this->denyUnlessSharesInstitution($request, $studentId);
    }

    /**
     * Deny unless the caller belongs to a school this student is enrolled at.
     *
     * Split from the permission check because a request that accepts either of
     * two permissions still gets scoped to one school, and doing the membership
     * check once keeps the reported reason honest: a teacher at another school is
     * told about the school, not about a module they may well hold.
     */
    private function denyUnlessSharesInstitution(Request $request, string $studentId): ?JsonResponse
    {
        if ($request->user()->hasFullAccess()) {
            return null;
        }

        $studentInstitutionIds = Student::find($studentId)
            ?->studentInstitutions()
            ->pluck('institution_id')
            ->all() ?? [];

        $shared = array_intersect($this->callerInstitutionIds($request), $studentInstitutionIds);

        return $shared === []
            ? $this->forbidden('You can only manage students within your own institution')
            : null;
    }

    /**
     * Deny unless the caller may create a login for a student who has none.
     *
     * Either grant is enough here, so the narrower one is tried second and its
     * denial is the one reported — a role holding neither is told about the
     * bigger permission, which is the one an administrator would grant.
     */
    private function denyUnlessCanCreateLogin(Request $request, string $studentId): ?JsonResponse
    {
        $deny = $this->denyUnlessModule($request, 'students', 'manage');

        if ($deny !== null && $this->denyUnlessModule($request, 'students', 'reset-portal-password') !== null) {
            return $deny;
        }

        return $this->denyUnlessSharesInstitution($request, $studentId);
    }

    /**
     * Create or update login credentials for a student.
     * POST /students/{student}/auth with email, password, is_new (optional).
     * Every change is recorded in student_auth_logs with the acting staff user.
     *
     * Two grants reach this. `students.manage` may do either half: create a
     * login, or move an existing one to a different email.
     * `students.reset-portal-password` may only create — a subject teacher is
     * who a student without a login actually tells, so they can set one up, but
     * an existing login stays where it is. Redirecting one to an address the
     * caller controls and then resetting the password against it is how you sign
     * in as somebody else, and a reset-only role has resetPassword() for the
     * thing they legitimately need.
     */
    public function store(Request $request, string $student): JsonResponse
    {
        $existing = StudentAuth::where('student_id', $student)->first();

        // A create is permitted by either grant; touching a login that already
        // exists is not. Checked before validation so the answer does not depend
        // on whether the payload happened to be well-formed.
        if ($existing) {
            if ($deny = $this->denyUnlessManagesStudent($request, $student, 'manage')) {
                return $deny;
            }
        } elseif ($deny = $this->denyUnlessCanCreateLogin($request, $student)) {
            return $deny;
        }

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

        $oldEmail = $existing?->email;
        $newEmail = $request->email;

        $auth = StudentAuth::updateOrCreate(
            ['student_id' => $student],
            [
                'email' => $newEmail,
                'password' => Hash::make($request->password),
                'is_new' => $request->boolean('is_new', true),
                // Credentials changed, so any session issued against the old
                // ones should stop working rather than outlive the reset.
                'token' => null,
                'token_expiry' => null,
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
     * Issue a new portal password, leaving the email alone.
     *
     * POST /students/{student}/auth/reset-password with password.
     *
     * Narrower than store() on purpose: this one cannot touch the email, and
     * moving an existing login to another address is the part a reset-only role
     * does not hold — an email is the account, so someone who can point it at
     * their own can then reset the password against it and sign in as that
     * student. Keeping them as separate endpoints is what makes that line
     * enforceable, rather than one endpoint that sometimes ignores part of its
     * payload.
     *
     * A student with no login yet is a 404 here, not an implicit create: there is
     * no password to reset and no email to reset it against. Creating the login
     * is store(), which both grants reach.
     */
    public function resetPassword(Request $request, string $student): JsonResponse
    {
        if ($deny = $this->denyUnlessManagesStudent($request, $student, 'reset-portal-password')) {
            return $deny;
        }

        $request->validate([
            'password' => 'required|string|min:6',
        ]);

        $auth = StudentAuth::where('student_id', $student)->first();

        if (! $auth) {
            return response()->json([
                'success' => false,
                'message' => 'This student does not have a portal login yet. Create one with an email address first, then it can be reset.',
            ], 404);
        }

        $auth->update([
            'password' => Hash::make($request->password),
            // The student is signing in with a password someone else picked, so
            // the portal should make them set their own.
            'is_new' => true,
            // Sessions issued against the old password must stop working, or a
            // reset does nothing to whoever is already signed in.
            'token' => null,
            'token_expiry' => null,
        ]);

        $actor = $request->user();
        StudentAuthLog::create([
            'student_id' => $student,
            'performed_by' => $actor instanceof User ? $actor->id : null,
            'performed_by_name' => $this->actorName($actor),
            'action' => 'reset_password',
            // The email did not move; recording it on both sides keeps the log
            // readable next to entries that did change it.
            'old_email' => $auth->email,
            'new_email' => $auth->email,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Student portal password reset.',
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
    public function show(Request $request, string $student): JsonResponse
    {
        if ($deny = $this->denyUnlessManagesStudent($request, $student, 'view')) {
            return $deny;
        }

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
    public function logs(Request $request, string $student): JsonResponse
    {
        if ($deny = $this->denyUnlessManagesStudent($request, $student, 'view')) {
            return $deny;
        }

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
