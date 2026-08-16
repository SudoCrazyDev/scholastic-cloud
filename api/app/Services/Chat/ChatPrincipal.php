<?php

namespace App\Services\Chat;

use App\Auth\StudentPortalUser;
use App\Models\ChatParticipant;
use App\Models\Student;

/**
 * Who is using chat, flattened to the one shape the rest of the feature needs.
 *
 * Staff and students are different identities in this system — a teacher is a
 * `users` row, a student authenticates through `student_auth` and is handed a
 * StudentPortalUser wrapper that is not a User at all, and a student can also
 * appear as a User carrying the `student` role slug. Three inbound shapes, one
 * participant row; this is where that collapses.
 *
 * The student-detection rules mirror AnnouncementService::asStudent(), which
 * solves the same problem for the announcement board.
 */
final class ChatPrincipal
{
    private function __construct(
        public readonly string $type,
        public readonly string $id,
        public readonly string $name,
        public readonly ?string $institutionId,
    ) {}

    public static function resolve($user): ?self
    {
        if (! $user) {
            return null;
        }

        $student = self::asStudent($user);
        if ($student) {
            $institutionId = $student->studentInstitutions()
                ->where('is_active', true)
                ->value('institution_id')
                ?? $student->studentInstitutions()->value('institution_id');

            return new self(
                type: ChatParticipant::TYPE_STUDENT,
                id: $student->id,
                name: self::displayName($student->first_name, $student->last_name),
                institutionId: $institutionId,
            );
        }

        $institutionId = method_exists($user, 'getDefaultInstitutionId')
            ? $user->getDefaultInstitutionId()
            : null;

        if (! $institutionId && method_exists($user, 'userInstitutions')) {
            $institutionId = $user->userInstitutions()->value('institution_id');
        }

        return new self(
            type: ChatParticipant::TYPE_USER,
            id: (string) $user->id,
            name: self::displayName($user->first_name ?? null, $user->last_name ?? null),
            institutionId: $institutionId,
        );
    }

    public function isStudent(): bool
    {
        return $this->type === ChatParticipant::TYPE_STUDENT;
    }

    private static function asStudent($user): ?Student
    {
        if ($user instanceof StudentPortalUser) {
            return $user->student;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;
        if ((string) ($role->slug ?? '') === 'student') {
            return Student::where('user_id', $user->id)->first();
        }

        return null;
    }

    private static function displayName(?string $first, ?string $last): string
    {
        $name = trim(($first ?? '').' '.($last ?? ''));

        return $name !== '' ? $name : 'Unknown';
    }
}
