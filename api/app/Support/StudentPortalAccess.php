<?php

namespace App\Support;

use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;

/**
 * The institution-wide switch that closes the student portal for a while.
 *
 * Two things have to happen for "temporarily disable student access" to mean
 * anything: a student may not sign in while it is off, and students already
 * signed in have to stop being signed in. A login check alone would leave every
 * open session running until its 24-hour token expired, so closing the portal
 * also revokes those sessions.
 *
 * Staff accounts are untouched — this is about the student portal only.
 */
class StudentPortalAccess
{
    /**
     * The notice to show a student who may not sign in right now, or null when
     * they may.
     *
     * The school a student currently attends is the one that decides: enrolment
     * rows carry `is_active`, and a transferred student keeps the old school's
     * row as history. Reading every row alike would let a past school's open
     * portal undo the blackout at the school they actually attend. Rows are only
     * all considered when none of them is active, so a student with nothing but
     * history is still answerable to that school.
     *
     * A student with no institution at all is a different problem, reported
     * separately by the caller, so this returns null for them.
     */
    public static function blockedNoticeFor(Student $student): ?string
    {
        $student->loadMissing('studentInstitutions.institution');

        $enrolments = $student->studentInstitutions;
        $active = $enrolments->filter(fn (StudentInstitution $si) => (bool) $si->is_active);

        $institutions = ($active->isNotEmpty() ? $active : $enrolments)
            ->map(fn (StudentInstitution $si) => $si->institution)
            ->filter()
            ->values();

        if ($institutions->isEmpty()) {
            return null;
        }

        if ($institutions->contains(fn (Institution $i) => (bool) $i->student_portal_enabled)) {
            return null;
        }

        return $institutions->first()->studentPortalNotice();
    }

    /**
     * Sign out every student currently enrolled at an institution, returning how
     * many sessions were ended.
     *
     * Scoped to active enrolments, to match who the login check turns away: a
     * student who has since transferred elsewhere is no longer this school's to
     * sign out.
     */
    public static function revokeStudentSessions(string $institutionId): int
    {
        $studentIds = StudentInstitution::where('institution_id', $institutionId)
            ->where('is_active', true)
            ->pluck('student_id');

        if ($studentIds->isEmpty()) {
            return 0;
        }

        return StudentAuth::whereIn('student_id', $studentIds)
            ->whereNotNull('token')
            ->update(['token' => null, 'token_expiry' => null]);
    }
}
