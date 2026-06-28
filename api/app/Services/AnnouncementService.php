<?php

namespace App\Services;

use App\Auth\StudentPortalUser;
use App\Models\Announcement;
use App\Models\ClassSection;
use App\Models\Student;
use App\Models\StudentSection;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Resolves who is viewing the board and builds the visibility query that
 * decides which announcements that viewer may see.
 *
 * A "viewer" is described by:
 *   - kind:           'student' | 'staff'   (drives audience matching)
 *   - institution_id: the viewer's institution
 *   - section_ids:    sections the viewer belongs to (student: enrolled,
 *                     staff: advised section + sections of taught subjects)
 *   - grade_levels:   the grade_level strings of those sections
 */
class AnnouncementService
{
    /**
     * Resolve the current viewer, or null when they have no institution / identity.
     *
     * @return array{kind:string,institution_id:string,user_id:?string,student_id:?string,section_ids:array<int,string>,grade_levels:array<int,string>}|null
     */
    public function resolveViewer(Request $request): ?array
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $student = $this->asStudent($user);
        if ($student) {
            return $this->studentViewer($student);
        }

        return $this->staffViewer($user);
    }

    /**
     * Build the query of announcements visible to the given viewer, newest first
     * with pinned announcements floated to the top.
     */
    public function visibleQuery(array $viewer): Builder
    {
        $audiences = $viewer['kind'] === 'student'
            ? ['students', 'both']
            : ['teachers', 'both'];

        $sectionIds = $viewer['section_ids'];
        $gradeLevels = $viewer['grade_levels'];

        return Announcement::query()
            ->where('institution_id', $viewer['institution_id'])
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('publish_at')->orWhere('publish_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->whereIn('audience', $audiences)
            ->where(function ($q) use ($sectionIds, $gradeLevels) {
                $q->where('scope', 'institution');

                $q->orWhere(function ($inner) use ($sectionIds) {
                    $inner->where('scope', 'sections')
                        ->whereHas('sections', fn ($s) => $s->whereIn('class_sections.id', $sectionIds ?: ['__none__']));
                });

                $q->orWhere(function ($inner) use ($gradeLevels) {
                    $inner->where('scope', 'grade_levels')
                        ->whereHas('gradeLevels', fn ($g) => $g->whereIn('grade_level', $gradeLevels ?: ['__none__']));
                });
            })
            ->orderByDesc('is_pinned')
            ->orderByDesc('publish_at')
            ->orderByDesc('created_at');
    }

    /**
     * Resolve a student record from the authenticated principal, or null if the
     * principal is not a student.
     */
    public function asStudent($user): ?Student
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

    private function studentViewer(Student $student): ?array
    {
        $institutionId = $student->studentInstitutions()
            ->where('is_active', true)
            ->value('institution_id')
            ?? $student->studentInstitutions()->value('institution_id');

        if (! $institutionId) {
            return null;
        }

        $sectionIds = StudentSection::where('student_id', $student->id)
            ->where('is_active', true)
            ->pluck('section_id')
            ->all();

        $gradeLevels = ClassSection::whereIn('id', $sectionIds)
            ->pluck('grade_level')
            ->filter()
            ->unique()
            ->values()
            ->all();

        return [
            'kind' => 'student',
            'institution_id' => $institutionId,
            'user_id' => null,
            'student_id' => $student->id,
            'section_ids' => $sectionIds,
            'grade_levels' => $gradeLevels,
        ];
    }

    private function staffViewer($user): ?array
    {
        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $institutionId = $user->userInstitutions()->value('institution_id');
        }
        if (! $institutionId) {
            return null;
        }

        $sectionIds = $this->staffSectionIds($user, $institutionId);

        $gradeLevels = ClassSection::whereIn('id', $sectionIds)
            ->pluck('grade_level')
            ->filter()
            ->unique()
            ->values()
            ->all();

        return [
            'kind' => 'staff',
            'institution_id' => $institutionId,
            'user_id' => $user->id,
            'student_id' => null,
            'section_ids' => $sectionIds,
            'grade_levels' => $gradeLevels,
        ];
    }

    /**
     * Sections a staff member is tied to: sections they advise + sections of the
     * subjects they teach (within the given institution).
     *
     * @return array<int,string>
     */
    public function staffSectionIds($user, string $institutionId): array
    {
        $advisedSectionIds = ClassSection::where('institution_id', $institutionId)
            ->where('adviser', $user->id)
            ->pluck('id')
            ->all();

        $taughtSectionIds = $user->advisedSubjects()
            ->whereNotNull('class_section_id')
            ->pluck('class_section_id')
            ->all();

        return array_values(array_unique(array_merge($advisedSectionIds, $taughtSectionIds)));
    }
}
