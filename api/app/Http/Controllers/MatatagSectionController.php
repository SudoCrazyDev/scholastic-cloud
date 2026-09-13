<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Models\ClassSection;
use App\Models\MatatagCompetencyRating;
use App\Models\MatatagCurriculumVersion;
use App\Models\MatatagGradeLevelCurriculum;
use App\Models\MatatagSectionCurriculum;
use App\Models\MatatagTermNarrative;
use App\Services\Matatag\CurriculumTree;
use App\Support\AcademicYear;
use App\Support\MatatagTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Which sections report on MATATAG, and against which catalog version.
 *
 * Opting in is kept behind its own `set-up` ability rather than `manage`,
 * because it is a different act: `manage` records one learner's descriptor,
 * `set-up` decides how a whole year of a whole section is reported and pins the
 * catalog every descriptor in it will be recorded against. A school should be
 * able to give an adviser the first without the second.
 */
class MatatagSectionController extends Controller
{
    use ResolvesMatatagSection;

    public function __construct(private readonly CurriculumTree $tree) {}

    /**
     * The Key Stage 1 sections the caller can reach, and where each one stands.
     *
     * Includes sections that have *not* opted in — a principal needs to see
     * which Grade 1 sections are still on the old numeric record, and that
     * list is the whole reason this endpoint is not just a list of pins.
     */
    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $deny;
        }

        if ($deny = $this->denyUnlessModule($request, self::MODULE, 'view', $institutionId)) {
            return $deny;
        }

        $academicYear = $request->input('academic_year') ?: AcademicYear::forInstitution($institutionId);

        $sections = ClassSection::query()
            ->where('institution_id', $institutionId)
            ->where(function ($q) use ($academicYear) {
                $q->where('academic_year', $academicYear)->orWhereNull('academic_year');
            })
            ->orderBy('grade_level')->orderBy('title')
            ->get()
            // A free string a school types, matched leniently — 'grade 1' and
            // 'GRADE  1' are the same grade level.
            ->filter(fn (ClassSection $s) => MatatagTerms::isKeyStageOne($s->grade_level))
            ->filter(fn (ClassSection $s) => $this->canReachSection($request, $s))
            ->values();

        $pins = MatatagSectionCurriculum::with('curriculumVersion')
            ->whereIn('class_section_id', $sections->pluck('id'))
            ->where('academic_year', $academicYear)
            ->get()
            ->keyBy('class_section_id');

        $defaults = MatatagGradeLevelCurriculum::with('curriculumVersion')->get()
            ->keyBy('grade_level');

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'sections' => $sections->map(function (ClassSection $section) use ($pins, $defaults) {
                    $pin = $pins[$section->id] ?? null;
                    $canonical = MatatagTerms::canonicalGradeLevel($section->grade_level);
                    $default = $canonical ? ($defaults[$canonical] ?? null) : null;

                    return [
                        'id' => $section->id,
                        'title' => $section->title,
                        'grade_level' => $section->grade_level,
                        'academic_year' => $section->academic_year,
                        'adviser_id' => $section->adviser,
                        'opted_in' => (bool) $pin?->enabled,
                        'has_ever_opted_in' => $pin !== null,
                        'curriculum_version' => $pin?->curriculumVersion
                            ? $this->tree->version($pin->curriculumVersion)
                            : null,
                        // Null means no catalog has been published for this
                        // grade level yet — the honest answer for Grades 2 and
                        // 3 until their workbooks arrive, and what the client
                        // uses to disable the opt-in button with a reason
                        // rather than letting it fail.
                        'available_curriculum_version' => $default?->curriculumVersion
                            ? $this->tree->version($default->curriculumVersion)
                            : null,
                    ];
                })->all(),
            ],
        ]);
    }

    /**
     * Opt a section in, pinning the catalog its descriptors will be recorded
     * against for the rest of the year.
     */
    public function store(Request $request, string $sectionId): JsonResponse
    {
        if ($deny = $this->resolveSection($request, $sectionId, $section, 'set-up')) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);
        $gradeLevel = MatatagTerms::canonicalGradeLevel($section->grade_level);

        if ($gradeLevel === null) {
            return response()->json([
                'success' => false,
                'message' => "'{$section->grade_level}' is not a Key Stage 1 grade level. MATATAG "
                    .'progress reporting covers '.implode(', ', MatatagTerms::gradeLevels()).'; every '
                    .'other grade level keeps the numeric record it has now.',
                'code' => 'not_key_stage_one',
            ], 422);
        }

        $version = $this->requestedVersion($request, $gradeLevel, $error);

        if ($error !== null) {
            return $error;
        }

        $existing = MatatagSectionCurriculum::where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->first();

        // Re-opting in is fine. Re-pinning to a *different* catalog once marks
        // exist is not: the descriptors already recorded point at the old
        // version's slots, and half a year against one catalog and half
        // against another is not a record anyone can print.
        if ($existing && $existing->curriculum_version_id !== $version->id) {
            $marked = MatatagCompetencyRating::where('class_section_id', $section->id)
                ->where('academic_year', $academicYear)
                ->count();

            if ($marked > 0) {
                return response()->json([
                    'success' => false,
                    'message' => "This section already has {$marked} descriptor(s) recorded against "
                        ."'{$existing->curriculumVersion?->code}' for {$academicYear}. A section stays "
                        .'on one catalog for the whole year; moving it now would leave those marks '
                        .'pointing at competencies this section no longer reports on.',
                    'code' => 'already_marked',
                ], 409);
            }
        }

        $pin = MatatagSectionCurriculum::updateOrCreate(
            ['class_section_id' => $section->id, 'academic_year' => $academicYear],
            [
                'institution_id' => $section->institution_id,
                'curriculum_version_id' => $version->id,
                // Snapshotted, because `class_sections.grade_level` is a free
                // string a school may rename mid-year. That must not silently
                // unpin a section that already has descriptors.
                'grade_level' => $gradeLevel,
                'enabled' => true,
                'enabled_by' => $request->user()->id,
                'enabled_at' => now(),
            ],
        );

        return response()->json([
            'success' => true,
            'message' => "{$section->title} now reports on MATATAG for {$academicYear}.",
            'data' => $this->pinPayload($pin->fresh('curriculumVersion'), $section),
        ], $existing ? 200 : 201);
    }

    /**
     * Switch a section off MATATAG reporting.
     *
     * Disables; never deletes. The descriptors and narratives have to survive
     * so the year can still be printed, and a school that opts out in March
     * has not decided that January did not happen.
     */
    public function destroy(Request $request, string $sectionId): JsonResponse
    {
        if ($deny = $this->resolveSection($request, $sectionId, $section, 'set-up')) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        $pin = MatatagSectionCurriculum::where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->first();

        if (! $pin) {
            return response()->json([
                'success' => false,
                'message' => 'This section is not reporting on MATATAG for '.$academicYear.'.',
                'code' => 'not_opted_in',
            ], 409);
        }

        $pin->update(['enabled' => false]);

        $kept = MatatagCompetencyRating::where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)->count();

        $narratives = MatatagTermNarrative::where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)->count();

        return response()->json([
            'success' => true,
            'message' => $kept || $narratives
                ? "{$section->title} no longer reports on MATATAG for {$academicYear}. Its {$kept} "
                    ."descriptor(s) and {$narratives} narrative(s) are kept and can still be printed."
                : "{$section->title} no longer reports on MATATAG for {$academicYear}.",
            'data' => $this->pinPayload($pin->fresh('curriculumVersion'), $section),
        ]);
    }

    /**
     * The catalog version to pin: the one the request names, or the grade
     * level's default.
     *
     * A grade level with no default has no catalog at all — true for Grades 2
     * and 3 until their workbooks arrive — and that is refused by name rather
     * than by letting a Grade 2 section quietly pin Grade 1's competencies.
     * DepEd's own workbook offers Grades 1 to 3 in its header while carrying
     * only Grade 1's competencies, so this is exactly the mistake the file
     * invites.
     *
     * @param  JsonResponse|null  $error  out-param
     */
    private function requestedVersion(
        Request $request,
        string $gradeLevel,
        ?JsonResponse &$error,
    ): ?MatatagCurriculumVersion {
        $error = null;
        $requested = $request->input('curriculum_version_id');

        if (is_string($requested) && $requested !== '') {
            $version = MatatagCurriculumVersion::find($requested);

            if (! $version) {
                $error = response()->json([
                    'success' => false,
                    'message' => 'That curriculum version does not exist.',
                ], 422);

                return null;
            }

            if ($version->grade_level !== $gradeLevel) {
                $error = response()->json([
                    'success' => false,
                    'message' => "That catalog is for {$version->grade_level}, but this section is "
                        ."{$gradeLevel}. A section must report on its own grade level's competencies.",
                    'code' => 'grade_level_mismatch',
                ], 422);

                return null;
            }

            return $version;
        }

        $default = MatatagGradeLevelCurriculum::with('curriculumVersion')->find($gradeLevel);

        if (! $default?->curriculumVersion) {
            $error = response()->json([
                'success' => false,
                'message' => "No DepEd catalog has been published for {$gradeLevel} yet, so there is "
                    .'nothing for this section to report against. The catalog arrives as a data file; '
                    .'no code change is needed once DepEd releases the workbook.',
                'code' => 'no_catalog',
            ], 422);

            return null;
        }

        return $default->curriculumVersion;
    }

    private function pinPayload(MatatagSectionCurriculum $pin, ClassSection $section): array
    {
        return [
            'class_section_id' => $pin->class_section_id,
            'academic_year' => $pin->academic_year,
            'grade_level' => $pin->grade_level,
            'section_grade_level' => $section->grade_level,
            'enabled' => $pin->enabled,
            'enabled_at' => $pin->enabled_at?->toIso8601String(),
            'curriculum_version' => $pin->curriculumVersion
                ? $this->tree->version($pin->curriculumVersion)
                : null,
        ];
    }
}
