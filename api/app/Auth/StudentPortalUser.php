<?php

namespace App\Auth;

use App\Models\Student;
use App\Models\StudentAuth;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Wrapper used when a student logs in via student_auth (email/password).
 * Allows the same auth middleware and profile endpoint to work for students.
 */
class StudentPortalUser implements Authenticatable
{
    public function __construct(
        public Student $student,
        public StudentAuth $studentAuth,
    ) {
    }

    public function getAuthIdentifierName(): string
    {
        return 'student_id';
    }

    public function getAuthIdentifier(): string
    {
        return $this->student->id;
    }

    /** For compatibility with code that expects $user->id (e.g. profile uses student id). */
    public function __get(string $key): mixed
    {
        if ($key === 'id') {
            return $this->student->id;
        }
        return null;
    }

    public function getAuthPassword(): string
    {
        return $this->studentAuth->password;
    }

    public function getAuthPasswordName(): string
    {
        return 'password';
    }

    public function getRememberToken(): ?string
    {
        return null;
    }

    public function setRememberToken($value): void
    {
    }

    public function getRememberTokenName(): ?string
    {
        return null;
    }

    /** Used by profile() to return student role. */
    public function getRole(): object
    {
        return (object) [
            'title' => 'Student',
            'slug' => 'student',
        ];
    }

    /** Stub for staff-only controllers that call getDefaultInstitutionId(). */
    public function getDefaultInstitutionId(): ?string
    {
        return null;
    }

    /** Stub for staff-only controllers that use userInstitutions. */
    public function userInstitutions()
    {
        return new \Illuminate\Database\Eloquent\Collection([]);
    }
}
