<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\Institution;
use App\Support\StudentPortalAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Temporarily close the student portal for the caller's own institution.
 *
 * Route middleware carries the permission check (`settings.view` to read,
 * `settings.manage` to change), and it already turns student tokens away, so a
 * student cannot read — let alone flip — the switch that locks them out.
 */
class StudentPortalAccessController extends Controller
{
    use AuthorizesModuleAccess;

    public function show(Request $request): JsonResponse
    {
        $institution = $this->callerInstitution($request, $error);
        if (! $institution) {
            return $error;
        }

        return response()->json([
            'success' => true,
            'data' => $this->payload($institution),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $institution = $this->callerInstitution($request, $error);
        if (! $institution) {
            return $error;
        }

        $validated = $request->validate([
            'student_portal_enabled' => 'required|boolean',
            'student_portal_disabled_message' => 'nullable|string|max:300',
        ]);

        $enabled = (bool) $validated['student_portal_enabled'];
        $message = trim((string) ($validated['student_portal_disabled_message'] ?? ''));

        $institution->update([
            'student_portal_enabled' => $enabled,
            // Keep the school's wording between blackouts: it is the same notice
            // they will want next time, and clearing it would make reopening the
            // portal quietly discard what they wrote.
            'student_portal_disabled_message' => $message !== '' ? $message : null,
        ]);

        // Closing the portal has to end the sessions already open, or students
        // who were signed in when the switch was thrown keep browsing.
        $signedOut = $enabled ? 0 : StudentPortalAccess::revokeStudentSessions($institution->id);

        return response()->json([
            'success' => true,
            'message' => $enabled
                ? 'Students can sign in again.'
                : 'Student access is now disabled.'.($signedOut > 0 ? " {$signedOut} signed-in student(s) were signed out." : ''),
            'data' => $this->payload($institution->fresh()) + ['students_signed_out' => $signedOut],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Institution $institution): array
    {
        return [
            'student_portal_enabled' => (bool) $institution->student_portal_enabled,
            'student_portal_disabled_message' => $institution->student_portal_disabled_message,
            'default_disabled_message' => Institution::STUDENT_PORTAL_DISABLED_MESSAGE,
        ];
    }

    /**
     * The institution the caller administers, or null with the response to send.
     *
     * @param  JsonResponse|null  $error  out-param: the response to return when null comes back
     */
    private function callerInstitution(Request $request, ?JsonResponse &$error): ?Institution
    {
        $error = null;
        $institutionId = $this->activeInstitutionId($request);

        if (! $institutionId) {
            $error = response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned.',
            ], 400);

            return null;
        }

        $institution = Institution::find($institutionId);

        if (! $institution) {
            $error = response()->json(['success' => false, 'message' => 'Institution not found.'], 404);

            return null;
        }

        return $institution;
    }
}
