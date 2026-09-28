<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Models\ClassSection;
use App\Models\MatatagLearningArea;
use App\Models\MatatagSectionCurriculum;
use App\Models\MatatagSubjectLearningArea;
use App\Models\Subject;
use App\Models\User;
use App\Services\Matatag\CurriculumTree;
use App\Services\Matatag\LearningAreaTeachers;
use App\Support\AcademicYear;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Which of a section's subjects stands for each learning area, and so which
 * subject teacher may mark it.
 *
 * Only the adviser (or someone holding `view-all`) sees and changes the links.
 * A subject teacher is never let in here — they reach their own area through
 * `forSubject()` and the grid, and nothing else.
 */
class MatatagLearningAreaTeacherController extends Controller
{
    use ResolvesMatatagSection;

    public function __construct(
        private readonly CurriculumTree $tree,
        private readonly LearningAreaTeachers $teachers,
    ) {}

    /** Every area of the section's catalog, its linked subject, and a suggestion for the rest. */
    public function index(Request $request, string $sectionId): JsonResponse
    {
        if ($deny = $this->resolveSection($request, $sectionId, $section)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        return response()->json([
            'success' => true,
            'data' => $this->payload($section, $pin),
        ]);
    }

    /**
     * Replace the links for the areas named. An area sent with a null subject
     * goes back to the adviser; an area left out is not touched.
     */
    public function update(Request $request, string $sectionId): JsonResponse
    {
        if ($deny = $this->resolveSection($request, $sectionId, $section, 'manage')) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        $request->validate([
            'links' => 'present|array|max:50',
            'links.*.learning_area_id' => 'required|uuid',
            'links.*.subject_id' => 'nullable|uuid',
        ]);

        $links = collect($request->input('links', []))->keyBy('learning_area_id');

        // Both sides resolved within this section, so an area from another
        // catalog or a subject from another section — or school — is simply
        // not found.
        $areaIds = $this->teachers->areas($pin)->pluck('id')->all();
        $foreignAreas = $links->keys()->diff($areaIds)->values();

        if ($foreignAreas->isNotEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'That learning area is not part of the catalog this section reports against.',
                'code' => 'area_not_in_curriculum',
                'errors' => ['learning_area_id' => $foreignAreas->take(10)->all()],
            ], 422);
        }

        $subjectIds = $links->pluck('subject_id')->filter()->unique()->values();
        $ownSubjects = Subject::where('class_section_id', $section->id)
            ->whereIn('id', $subjectIds)
            ->pluck('id');
        $foreignSubjects = $subjectIds->diff($ownSubjects)->values();

        if ($foreignSubjects->isNotEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'A learning area can only be linked to one of this section\'s own subjects.',
                'code' => 'subject_not_in_section',
                'errors' => ['subject_id' => $foreignSubjects->take(10)->all()],
            ], 422);
        }

        $userId = $request->user()->id;

        DB::transaction(function () use ($links, $section, $academicYear, $userId) {
            foreach ($links as $areaId => $link) {
                $subjectId = $link['subject_id'] ?? null;

                if ($subjectId === null || $subjectId === '') {
                    MatatagSubjectLearningArea::where('class_section_id', $section->id)
                        ->where('academic_year', $academicYear)
                        ->where('learning_area_id', $areaId)
                        ->delete();

                    continue;
                }

                MatatagSubjectLearningArea::updateOrCreate(
                    [
                        'class_section_id' => $section->id,
                        'academic_year' => $academicYear,
                        'learning_area_id' => $areaId,
                    ],
                    [
                        'institution_id' => $section->institution_id,
                        'subject_id' => $subjectId,
                        'linked_by' => $userId,
                    ],
                );
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Learning-area teachers saved.',
            'data' => $this->payload($section, $pin),
        ]);
    }

    /**
     * The learning area a subject stands for, if any — what the subject
     * teacher's own page asks to decide whether to offer a MATATAG tab.
     *
     * Answers 200 with null data when the subject is not linked or its section
     * is not reporting on MATATAG: that is the ordinary case for every subject
     * outside Grade 1, not an error.
     */
    public function forSubject(Request $request, string $subjectId): JsonResponse
    {
        if ($deny = $this->denyUnlessStaff($request)) {
            return $deny;
        }

        $user = $this->staffUser($request);

        $query = Subject::with('classSection')->whereKey($subjectId);

        if (! $user->hasFullAccess()) {
            $query->whereIn('institution_id', $this->callerInstitutionIds($request));
        }

        $subject = $query->first();
        $section = $subject?->classSection;

        if (! $subject || ! $section) {
            return response()->json(['success' => false, 'message' => 'Subject not found'], 404);
        }

        if (! $user->hasModuleAccess(self::MODULE, 'view', $section->institution_id)) {
            return $this->forbidden('You do not have access to this module');
        }

        if ($subject->adviser !== $user->id && ! $this->canReachSection($request, $section)) {
            return $this->forbidden('You can only open the subjects you teach.');
        }

        $academicYear = $request->input('academic_year') ?: AcademicYear::forSection($section);

        $pin = MatatagSectionCurriculum::where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->where('enabled', true)
            ->first();

        $link = $pin
            ? MatatagSubjectLearningArea::with('learningArea')
                ->where('class_section_id', $section->id)
                ->where('academic_year', $academicYear)
                ->where('subject_id', $subject->id)
                ->orderBy('created_at')
                ->first()
            : null;

        return response()->json([
            'success' => true,
            'data' => $link?->learningArea ? [
                'subject_id' => $subject->id,
                'class_section_id' => $section->id,
                'section_title' => $section->title,
                'grade_level' => $section->grade_level,
                'academic_year' => $academicYear,
                'learning_area' => $this->tree->area($link->learningArea),
            ] : null,
        ]);
    }

    private function payload(ClassSection $section, MatatagSectionCurriculum $pin): array
    {
        $areas = $this->teachers->areas($pin);
        $subjects = $this->teachers->subjects($section);
        $links = $this->teachers->links($section, $pin->academic_year);
        $suggestions = $this->teachers->suggest(
            $areas->reject(fn (MatatagLearningArea $area) => $links->has($area->id)),
            $subjects,
        );

        return [
            'class_section_id' => $section->id,
            'academic_year' => $pin->academic_year,
            'adviser_id' => $section->adviser,
            'areas' => $areas->map(function (MatatagLearningArea $area) use ($links, $suggestions) {
                $link = $links[$area->id] ?? null;

                return [
                    'learning_area' => $this->tree->area($area),
                    'subject' => $link?->subject ? $this->subjectPayload($link->subject) : null,
                    'suggested_subject_id' => $suggestions[$area->id] ?? null,
                ];
            })->values()->all(),
            'subjects' => $subjects->map(fn (Subject $s) => $this->subjectPayload($s))->values()->all(),
        ];
    }

    private function subjectPayload(Subject $subject): array
    {
        return [
            'id' => $subject->id,
            'title' => $subject->title,
            'teacher' => $subject->adviserUser ? [
                'id' => $subject->adviserUser->id,
                'name' => $this->teacherName($subject->adviserUser),
            ] : null,
        ];
    }

    private function teacherName(User $user): string
    {
        return trim(implode(' ', array_filter([$user->first_name, $user->last_name]))) ?: (string) $user->email;
    }
}
