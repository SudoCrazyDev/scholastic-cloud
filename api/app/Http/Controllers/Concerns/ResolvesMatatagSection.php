<?php

namespace App\Http\Controllers\Concerns;

use App\Models\ClassSection;
use App\Models\MatatagSectionCurriculum;
use App\Models\StudentSection;
use App\Services\Matatag\LearningAreaTeachers;
use App\Support\AcademicYear;
use App\Support\MatatagTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * One place where every MATATAG endpoint establishes what it is allowed to
 * touch.
 *
 * The module's whole attack surface is "a section id in a request body", and
 * the scoping in this repo is per-controller by design — there is no global
 * scope doing it for you, and `tests/Feature/SecurityAuthorizationTest.php`
 * exists because forgetting it has already leaked across tenants more than
 * once. So the resolution is written once, here, and every controller goes
 * through it rather than each reimplementing `where('institution_id', ...)`.
 *
 * `resolveSection()` answers three questions in one place:
 *
 * 1. **Does this section belong to the caller's school?** Scoped in the query
 *    itself, so a section from another tenant comes back as "not found" rather
 *    than being fetched and then judged — there is no window in which another
 *    school's row is in memory.
 * 2. **May this person mark it?** Any staff member of the section's own school
 *    who holds `matatag-grading.view` may open every section there and mark
 *    every learning area and remark — a school's decision, so that whoever is
 *    on hand can fill a card in. The school still decides who that is, by
 *    which roles it grants MATATAG Progress at all; and only `set-up` switches
 *    a section onto MATATAG.
 * 3. **Is the section reporting on MATATAG this year, and against which
 *    catalog?** The answer is the section's own pin and never the grade-level
 *    default, because the pin is what makes a new DepEd version invisible to a
 *    section already mid-year.
 */
trait ResolvesMatatagSection
{
    use AuthorizesModuleAccess;

    protected const MODULE = 'matatag-grading';

    /**
     * The section a request names, scoped to the caller, or a response to send.
     *
     * `$subjectTeachers` also lets in someone who teaches a subject linked to
     * one of the section's learning areas. Only the competency grid passes it,
     * and it must then narrow what that person touches with
     * `markableAreaIds()` — being let into the section is not being let into
     * all of it.
     *
     * @param  ClassSection|null  $section  out-param: the resolved section
     * @return JsonResponse|null response to return, or null to continue
     */
    protected function resolveSection(
        Request $request,
        string $sectionId,
        ?ClassSection &$section,
        string $ability = 'view',
        bool $subjectTeachers = false,
    ): ?JsonResponse {
        if ($deny = $this->denyUnlessStaff($request)) {
            return $deny;
        }

        $user = $this->staffUser($request);

        $query = ClassSection::query()->whereKey($sectionId);

        // A super-administrator operates across tenants by design; everyone
        // else is confined to the schools they belong to, in the query rather
        // than after it.
        if (! $user->hasFullAccess()) {
            $query->whereIn('institution_id', $this->callerInstitutionIds($request));
        }

        $section = $query->first();

        if (! $section) {
            return response()->json([
                'success' => false,
                'message' => 'Section not found',
            ], 404);
        }

        if (! $user->hasModuleAccess(self::MODULE, $ability, $section->institution_id)) {
            return $this->forbidden('You do not have access to this module');
        }

        $reachable = $this->canReachSection($request, $section)
            || ($subjectTeachers && app(LearningAreaTeachers::class)->teachesAnyAreaOf($user->id, $section));

        if (! $reachable) {
            return $this->forbidden(
                'You can only work on the sections you advise. Ask for the "See every Key Stage 1 '
                .'section in the school" permission to reach the others.'
            );
        }

        return null;
    }

    /**
     * Whether the caller may open — and so mark — a section.
     *
     * Every staff member with MATATAG Progress in the section's school, not
     * only its adviser: the school asked that anyone on its staff can enter a
     * learner's ratings and remarks. The section is already scoped to the
     * caller's own schools by `resolveSection()`, so this never reaches across
     * tenants.
     */
    protected function canReachSection(Request $request, ClassSection $section): bool
    {
        $user = $this->staffUser($request);

        if (! $user) {
            return false;
        }

        return $user->hasFullAccess()
            || $user->hasModuleAccess(self::MODULE, 'view', $section->institution_id);
    }

    /**
     * The learning areas the caller may work on in a section-year.
     *
     * Null means every area — the adviser, or someone holding `view-all`.
     * Otherwise the areas whose linked subject the caller teaches, which may
     * be none at all when the link belongs to another year.
     *
     * @return array<int, string>|null
     */
    protected function markableAreaIds(Request $request, ClassSection $section, string $academicYear): ?array
    {
        if ($this->canReachSection($request, $section)) {
            return null;
        }

        $user = $this->staffUser($request);

        return $user
            ? app(LearningAreaTeachers::class)->areaIdsTaughtBy($user->id, $section, $academicYear)
            : [];
    }

    /**
     * The section's MATATAG pin for a year, or a 409 explaining that it has
     * none.
     *
     * A 409 rather than a 404: the section exists and the caller may see it —
     * it simply is not reporting on MATATAG, which is a state a school changes
     * rather than an error the client made.
     *
     * @param  MatatagSectionCurriculum|null  $pin  out-param: the resolved pin
     * @return JsonResponse|null response to return, or null to continue
     */
    protected function resolvePin(
        ClassSection $section,
        string $academicYear,
        ?MatatagSectionCurriculum &$pin,
    ): ?JsonResponse {
        $pin = MatatagSectionCurriculum::with('curriculumVersion')
            ->where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->first();

        if (! $pin || ! $pin->enabled) {
            return response()->json([
                'success' => false,
                'message' => $pin
                    ? 'This section has been switched off MATATAG reporting for '.$academicYear.'.'
                    : 'This section is not reporting on MATATAG for '.$academicYear.'.',
                'code' => 'not_opted_in',
            ], 409);
        }

        return null;
    }

    /**
     * The academic year a request acts on.
     *
     * Never derived inline — CLAUDE.md forbids it, and two repair migrations
     * exist because that rule was broken once. A record saved without a year,
     * or with the wrong one, silently vanishes from every query that filters
     * on it.
     */
    protected function resolveAcademicYear(Request $request, ClassSection $section): string
    {
        $requested = $request->input('academic_year');

        return is_string($requested) && $requested !== ''
            ? $requested
            : AcademicYear::forSection($section);
    }

    /**
     * The learners on a section's roster for a year, in the order DepEd prints
     * them: males then females, alphabetical within each.
     *
     * Read from `student_sections` directly and NOT through `SubjectRoster`,
     * which resolves a *subject's* roster — the five learning areas are not
     * `subjects` rows and never will be.
     *
     * @return \Illuminate\Support\Collection<int, object>
     */
    protected function sectionRoster(ClassSection $section, string $academicYear)
    {
        return StudentSection::query()
            ->join('students', 'students.id', '=', 'student_sections.student_id')
            ->where('student_sections.section_id', $section->id)
            ->where('student_sections.academic_year', $academicYear)
            ->where('student_sections.is_active', true)
            ->orderByRaw("CASE WHEN LOWER(students.gender) = 'male' THEN 0 ELSE 1 END")
            ->orderBy('students.last_name')
            ->orderBy('students.first_name')
            ->select([
                'students.id',
                'students.lrn',
                'students.first_name',
                'students.middle_name',
                'students.last_name',
                'students.ext_name',
                'students.gender',
                'students.birthdate',
            ])
            ->get();
    }

    /**
     * Validate and return the term a request names.
     *
     * @param  int|null  $term  out-param: the validated term
     * @return JsonResponse|null response to return, or null to continue
     */
    protected function resolveTerm(Request $request, ?int &$term, string $key = 'term'): ?JsonResponse
    {
        $value = $request->input($key);

        if (! MatatagTerms::isValidTerm(is_numeric($value) ? (int) $value : null)) {
            return response()->json([
                'success' => false,
                'message' => 'Key Stage 1 has '.MatatagTerms::count().' terms; term '
                    .var_export($value, true).' does not exist.',
            ], 422);
        }

        $term = (int) $value;

        return null;
    }

    protected function learnerName(object $student): string
    {
        return trim(implode(' ', array_filter([
            $student->first_name,
            $student->middle_name,
            $student->last_name,
            $student->ext_name,
        ])));
    }

    /**
     * The name as a class record writes it: `ESTRADA, DINO L. JR.`
     *
     * This is not decoration. A Grade 1 adviser reads down a column of fifty
     * names looking for one learner, and every DepEd form they have ever used
     * -- the SF1, the class record, the workbook this module exports to --
     * lists surname first, in capitals. `learnerName()` above builds the
     * natural order for prose (a report card addressed to a parent); this
     * builds the sortable order for a list.
     *
     * The suffix trails the given names rather than joining the surname,
     * because that is what the Students tab of this same class-section screen
     * already does. Surname-first with the suffix moved (`ESTRADA JR., DINO
     * L.`) is arguably the better reading of a Philippine name, but an adviser
     * comparing two tabs of one screen would read the difference as a bug
     * before they read it as a refinement.
     *
     * Returns an empty string when a record has neither name, so a caller can
     * fall back rather than print a lone comma.
     */
    protected function learnerListName(object $student): string
    {
        $surname = trim((string) ($student->last_name ?? ''));

        $middle = trim((string) ($student->middle_name ?? ''));
        $initial = $middle === '' ? '' : mb_substr($middle, 0, 1).'.';

        $given = trim(implode(' ', array_filter([
            trim((string) ($student->first_name ?? '')),
            $initial,
            trim((string) ($student->ext_name ?? '')),
        ])));

        if ($surname === '' || $given === '') {
            return mb_strtoupper($surname !== '' ? $surname : $given);
        }

        return mb_strtoupper($surname.', '.$given);
    }
}
