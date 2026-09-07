<?php

namespace App\Http\Controllers;

use App\Models\Institution;
use App\Support\AcademicYear;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Class lists and enrolment counts for the Students module.
 *
 * Both endpoints read the same enrolment set — the active `student_sections`
 * rows for one institution and one academic year — and differ only in what they
 * return: `statistics` counts it, `roster` lists the students in it. The
 * Printing tab uses both: statistics to offer the sections and grade levels with
 * their headcounts, roster to fetch the names once a selection is printed.
 *
 * A dissolved section (status `dissolve`, `deleted_at` set) is excluded from
 * both. Its students were moved to a target section and their old pivot row was
 * deactivated, so counting it would list every transferred student twice.
 */
class StudentReportController extends Controller
{
    /**
     * Stands in for a section whose grade level was never set, so those students
     * are still counted and printed instead of collapsing into an empty group.
     */
    private const NO_GRADE_LEVEL = 'No Grade Level';

    /**
     * Male/female headcounts per section and per grade level.
     */
    public function statistics(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);

        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'error' => 'User does not have any institution assigned',
            ], 400);
        }

        $academicYear = $this->resolveAcademicYear($request, $institutionId);

        $enrolments = $this->enrolmentQuery($institutionId, $academicYear)
            ->select([
                'cs.id as section_id',
                'cs.title as section',
                'cs.grade_level',
                'gl.sort_order as grade_sort',
                'u.first_name as adviser_first_name',
                'u.last_name as adviser_last_name',
                's.id as student_id',
                's.gender',
            ])
            ->get();

        // Every section for the year, so one with nobody in it still shows up in
        // the picker with a headcount of zero rather than vanishing.
        $sections = $this->sectionQuery($institutionId, $academicYear)
            ->select([
                'cs.id as section_id',
                'cs.title as section',
                'cs.grade_level',
                'gl.sort_order as grade_sort',
                'u.first_name as adviser_first_name',
                'u.last_name as adviser_last_name',
            ])
            ->get();

        $bySection = [];

        foreach ($sections as $section) {
            $bySection[$section->section_id] = $this->emptyBucket([
                'section_id' => $section->section_id,
                'section' => $section->section,
                'grade_level' => $section->grade_level,
                'grade_sort' => $section->grade_sort,
                'adviser' => $this->personName($section->adviser_first_name, $section->adviser_last_name),
            ]);
        }

        $byGrade = [];
        $gradeSections = [];
        $seenInSection = [];
        $seenInGrade = [];
        $sectionedStudents = [];
        $totals = $this->emptyBucket([]);

        foreach ($enrolments as $row) {
            $gender = $this->normalizeGender($row->gender);
            $grade = $row->grade_level ?: self::NO_GRADE_LEVEL;

            if (! isset($bySection[$row->section_id])) {
                $bySection[$row->section_id] = $this->emptyBucket([
                    'section_id' => $row->section_id,
                    'section' => $row->section,
                    'grade_level' => $row->grade_level,
                    'grade_sort' => $row->grade_sort,
                    'adviser' => $this->personName($row->adviser_first_name, $row->adviser_last_name),
                ]);
            }

            if (! isset($byGrade[$grade])) {
                $byGrade[$grade] = $this->emptyBucket([
                    'grade_level' => $grade,
                    'grade_sort' => $row->grade_sort,
                ]);
                $gradeSections[$grade] = [];
            }

            $gradeSections[$grade][$row->section_id] = true;

            // A student with two active rows in the same year is a data fault,
            // not a pair of pupils: count them once per section, once per grade
            // level and once overall so the three sets of totals still agree.
            if (! isset($seenInSection[$row->section_id][$row->student_id])) {
                $seenInSection[$row->section_id][$row->student_id] = true;
                $bySection[$row->section_id][$gender]++;
                $bySection[$row->section_id]['total']++;
            }

            if (! isset($seenInGrade[$grade][$row->student_id])) {
                $seenInGrade[$grade][$row->student_id] = true;
                $byGrade[$grade][$gender]++;
                $byGrade[$grade]['total']++;
            }

            if (! isset($sectionedStudents[$row->student_id])) {
                $sectionedStudents[$row->student_id] = true;
                $totals[$gender]++;
                $totals['total']++;
            }
        }

        $bySection = array_values($bySection);
        usort($bySection, fn ($a, $b) => $this->compareGroups($a, $b, 'section'));

        $byGrade = array_map(function (array $bucket) use ($gradeSections) {
            $bucket['sections'] = count($gradeSections[$bucket['grade_level']] ?? []);

            return $bucket;
        }, array_values($byGrade));
        usort($byGrade, fn ($a, $b) => $this->compareGroups($a, $b, 'grade'));

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'academic_years' => $this->availableAcademicYears($institutionId, $academicYear),
                'institution' => $this->institutionHeader($institutionId),
                'by_section' => $this->withoutSortKey($bySection),
                'by_grade_level' => $this->withoutSortKey($byGrade),
                'unassigned' => $this->unassignedBucket($institutionId, array_keys($sectionedStudents)),
                'totals' => $totals,
            ],
        ]);
    }

    /**
     * Printable class lists, grouped either by section or by grade level.
     */
    public function roster(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);

        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'error' => 'User does not have any institution assigned',
            ], 400);
        }

        $validated = $request->validate([
            'academic_year' => 'nullable|string|max:20',
            'group_by' => 'nullable|in:section,grade_level',
            'sort' => 'nullable|in:name,gender',
            'section_ids' => 'nullable|array',
            'section_ids.*' => 'string',
            'grade_levels' => 'nullable|array',
            'grade_levels.*' => 'string',
        ]);

        $academicYear = $this->resolveAcademicYear($request, $institutionId);
        $groupBy = $validated['group_by'] ?? 'section';
        // DepEd's SF1 lists the boys first and then the girls, each run
        // alphabetical, so that is the order a printed class list wants.
        $sortBy = $validated['sort'] ?? 'gender';

        $query = $this->enrolmentQuery($institutionId, $academicYear)
            ->select([
                'cs.id as section_id',
                'cs.title as section',
                'cs.grade_level',
                'gl.sort_order as grade_sort',
                'u.first_name as adviser_first_name',
                'u.last_name as adviser_last_name',
                's.id as student_id',
                's.lrn',
                's.first_name',
                's.middle_name',
                's.last_name',
                's.ext_name',
                's.gender',
                's.birthdate',
                's.religion',
            ]);

        if (! empty($validated['section_ids'])) {
            $query->whereIn('cs.id', $validated['section_ids']);
        }

        if (! empty($validated['grade_levels'])) {
            $query->whereIn('cs.grade_level', $validated['grade_levels']);
        }

        $groups = [];
        $seen = [];

        foreach ($query->get() as $row) {
            $grade = $row->grade_level ?: self::NO_GRADE_LEVEL;
            $key = $groupBy === 'section' ? $row->section_id : $grade;

            if (! isset($groups[$key])) {
                $groups[$key] = $this->emptyBucket([
                    'key' => $key,
                    'label' => $groupBy === 'section'
                        ? $this->sectionLabel($row->grade_level, $row->section)
                        : $grade,
                    'section_id' => $groupBy === 'section' ? $row->section_id : null,
                    'section' => $groupBy === 'section' ? $row->section : null,
                    'grade_level' => $grade,
                    'grade_sort' => $row->grade_sort,
                    'adviser' => $groupBy === 'section'
                        ? $this->personName($row->adviser_first_name, $row->adviser_last_name)
                        : null,
                    'students' => [],
                ]);
            }

            // Grouped by grade level, a student sitting in two of its sections
            // would otherwise be printed twice on the same list.
            if (isset($seen[$key][$row->student_id])) {
                continue;
            }
            $seen[$key][$row->student_id] = true;

            $gender = $this->normalizeGender($row->gender);
            $groups[$key][$gender]++;
            $groups[$key]['total']++;
            $groups[$key]['students'][] = [
                'id' => $row->student_id,
                'lrn' => $row->lrn,
                'first_name' => $row->first_name,
                'middle_name' => $row->middle_name,
                'last_name' => $row->last_name,
                'ext_name' => $row->ext_name,
                'full_name' => $this->studentName($row),
                'list_name' => $this->listName($row),
                'gender' => $row->gender,
                'birthdate' => $row->birthdate,
                'age' => $this->ageToday($row->birthdate),
                'religion' => $row->religion,
                'section' => $row->section,
                'grade_level' => $row->grade_level,
            ];
        }

        $groups = array_values($groups);

        foreach ($groups as &$group) {
            // A class list is alphabetical by surname, not by given name.
            usort($group['students'], function (array $a, array $b) use ($sortBy) {
                if ($sortBy === 'gender') {
                    $byGender = $this->genderRank($a['gender']) <=> $this->genderRank($b['gender']);
                    if ($byGender !== 0) {
                        return $byGender;
                    }
                }

                return strnatcasecmp($a['list_name'], $b['list_name']);
            });
        }
        unset($group);

        usort($groups, fn ($a, $b) => $this->compareGroups($a, $b, $groupBy === 'section' ? 'section' : 'grade'));
        $groups = $this->withoutSortKey($groups);

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'group_by' => $groupBy,
                'sort' => $sortBy,
                'institution' => $this->institutionHeader($institutionId),
                'groups' => $groups,
                'totals' => $this->sumBuckets($groups),
            ],
        ]);
    }

    /**
     * The active enrolments of one institution in one academic year.
     *
     * `student_sections.is_active` is what separates a live enrolment from one
     * the student was transferred out of: a transfer deactivates the old row and
     * writes a new active one under the same academic year, so a past year still
     * reads correctly.
     */
    private function enrolmentQuery(string $institutionId, string $academicYear)
    {
        return DB::table('student_sections as ss')
            ->join('class_sections as cs', 'cs.id', '=', 'ss.section_id')
            ->join('students as s', 's.id', '=', 'ss.student_id')
            ->leftJoin('users as u', 'u.id', '=', 'cs.adviser')
            ->leftJoin('grade_levels as gl', 'gl.title', '=', 'cs.grade_level')
            ->where('cs.institution_id', $institutionId)
            ->whereNull('cs.deleted_at')
            ->where('ss.academic_year', $academicYear)
            ->where('ss.is_active', true);
    }

    private function sectionQuery(string $institutionId, string $academicYear)
    {
        return DB::table('class_sections as cs')
            ->leftJoin('users as u', 'u.id', '=', 'cs.adviser')
            ->leftJoin('grade_levels as gl', 'gl.title', '=', 'cs.grade_level')
            ->where('cs.institution_id', $institutionId)
            ->whereNull('cs.deleted_at')
            ->where('cs.academic_year', $academicYear);
    }

    /**
     * Students on the institution's roll who sit in no section for the year.
     *
     * An enrolled but unsectioned student is invisible to every by-section
     * count, so the Statistics tab shows them separately rather than letting the
     * school's headcount quietly come up short.
     */
    private function unassignedBucket(string $institutionId, array $sectionedStudentIds): array
    {
        $rows = DB::table('student_institutions as si')
            ->join('students as s', 's.id', '=', 'si.student_id')
            ->where('si.institution_id', $institutionId)
            ->where('si.is_active', true)
            ->where('s.is_active', true)
            ->when($sectionedStudentIds !== [], fn ($q) => $q->whereNotIn('s.id', $sectionedStudentIds))
            ->select('s.id', 's.gender')
            ->get();

        $bucket = $this->emptyBucket([]);

        foreach ($rows as $row) {
            $bucket[$this->normalizeGender($row->gender)]++;
            $bucket['total']++;
        }

        return $bucket;
    }

    /**
     * Years the school actually has sections or enrolments for, newest first.
     *
     * Served here rather than pointing the tab at `class-sections/academic-years`
     * because that endpoint is gated on the class-sections module, which a
     * registrar who only manages students need not hold.
     */
    private function availableAcademicYears(string $institutionId, string $current): array
    {
        $fromSections = DB::table('class_sections')
            ->where('institution_id', $institutionId)
            ->whereNull('deleted_at')
            ->whereNotNull('academic_year')
            ->distinct()
            ->pluck('academic_year');

        $fromEnrolments = DB::table('student_sections as ss')
            ->join('class_sections as cs', 'cs.id', '=', 'ss.section_id')
            ->where('cs.institution_id', $institutionId)
            ->whereNotNull('ss.academic_year')
            ->distinct()
            ->pluck('ss.academic_year');

        return $fromSections->merge($fromEnrolments)
            ->push($current)
            ->filter()
            ->unique()
            ->sortDesc()
            ->values()
            ->all();
    }

    private function institutionHeader(string $institutionId): ?array
    {
        $institution = Institution::select('id', 'title', 'abbr', 'address')->find($institutionId);

        return $institution ? [
            'title' => $institution->title,
            'abbr' => $institution->abbr,
            'address' => $institution->address,
        ] : null;
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        if (! $institutionId) {
            $institutionId = $user->userInstitutions()->value('institution_id');
        }

        return $institutionId;
    }

    private function resolveAcademicYear(Request $request, string $institutionId): string
    {
        return $request->filled('academic_year')
            ? (string) $request->input('academic_year')
            : AcademicYear::forInstitution($institutionId);
    }

    private function emptyBucket(array $attributes): array
    {
        return $attributes + ['male' => 0, 'female' => 0, 'other' => 0, 'total' => 0];
    }

    private function sumBuckets(array $groups): array
    {
        $totals = $this->emptyBucket([]);

        foreach ($groups as $group) {
            foreach (['male', 'female', 'other', 'total'] as $key) {
                $totals[$key] += $group[$key];
            }
        }

        return $totals;
    }

    /**
     * `students.gender` is a free-text column, so it holds 'male', 'Male' and
     * 'M' depending on when and how the record was created.
     */
    private function normalizeGender(?string $gender): string
    {
        return match (strtolower(trim((string) $gender))) {
            'male', 'm' => 'male',
            'female', 'f' => 'female',
            default => 'other',
        };
    }

    private function genderRank(?string $gender): int
    {
        return match ($this->normalizeGender($gender)) {
            'male' => 0,
            'female' => 1,
            default => 2,
        };
    }

    /**
     * Grade level first — by the order the platform gives grade levels, falling
     * back to the title — then the section title.
     */
    private function compareGroups(array $a, array $b, string $kind): int
    {
        $sortA = $a['grade_sort'] ?? null;
        $sortB = $b['grade_sort'] ?? null;

        if ($sortA !== null && $sortB !== null) {
            if ($sortA !== $sortB) {
                return $sortA <=> $sortB;
            }
        } elseif ($sortA === null && $sortB !== null) {
            return 1;
        } elseif ($sortA !== null && $sortB === null) {
            return -1;
        }

        $byGrade = strnatcasecmp((string) ($a['grade_level'] ?? ''), (string) ($b['grade_level'] ?? ''));

        if ($byGrade !== 0 || $kind !== 'section') {
            return $byGrade;
        }

        return strnatcasecmp((string) ($a['section'] ?? ''), (string) ($b['section'] ?? ''));
    }

    private function sectionLabel(?string $gradeLevel, ?string $section): string
    {
        $label = trim(implode(' — ', array_filter([$gradeLevel, $section])));

        return $label !== '' ? $label : 'Untitled Section';
    }

    private function personName(?string $firstName, ?string $lastName): ?string
    {
        $name = trim(implode(' ', array_filter([$firstName, $lastName])));

        return $name !== '' ? $name : null;
    }

    /**
     * `grade_sort` orders the groups and is of no use to the caller once they
     * are in order, so it does not go out in the payload.
     */
    private function withoutSortKey(array $groups): array
    {
        return array_map(function (array $group) {
            unset($group['grade_sort']);

            return $group;
        }, $groups);
    }

    private function studentName(object $row): string
    {
        $name = trim(implode(' ', array_filter([
            $row->first_name,
            $row->middle_name,
            $row->last_name,
            $row->ext_name,
        ])));

        return $name !== '' ? $name : '—';
    }

    /**
     * Surname first — the form a printed class list is read and sorted in.
     */
    private function listName(object $row): string
    {
        $given = trim(implode(' ', array_filter([$row->first_name, $row->middle_name])));
        $surname = trim(implode(' ', array_filter([$row->last_name, $row->ext_name])));

        if ($surname === '') {
            return $given !== '' ? $given : '—';
        }

        return $given !== '' ? $surname.', '.$given : $surname;
    }

    /**
     * Age as of the day the list is printed, which is what a class list carries.
     */
    private function ageToday(?string $birthdate): ?int
    {
        if (! $birthdate) {
            return null;
        }

        try {
            return (int) Carbon::parse($birthdate)->age;
        } catch (\Throwable) {
            return null;
        }
    }
}
