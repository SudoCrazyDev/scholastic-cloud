<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Models\ClassSection;
use App\Models\CoreValueMarking;
use App\Models\Institution;
use App\Models\ReportCardPublication;
use App\Models\Student;
use App\Models\StudentAdviserComment;
use App\Models\StudentAttendance;
use App\Models\StudentRunningGrade;
use App\Models\Subject;
use App\Models\User;
use App\Services\Matatag\ProgressReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The student portal's report cards: only the ones a teacher has published.
 *
 * Staff render a card from half a dozen endpoints — the section, its school
 * days, the learner's core values, the grade level's template — and most of
 * those are rightly closed to students. Opening each of them to the portal
 * would mean teaching every one of those controllers who a student is and
 * which of their rows are released. Instead this composes the same data, for
 * one published card, in one place: what a student can read is exactly what
 * this controller returns, and nothing here takes an id the student chose
 * except the publication's own, which is looked up under their student id.
 *
 * The payload mirrors what the client's `useStudentReportCard` assembles, so
 * the portal prints with the very components an adviser prints with.
 */
class MyReportCardController extends Controller
{
    use ResolvesMatatagSection;

    public function __construct(private readonly ProgressReport $progressReport) {}

    /** The caller's published cards, newest school year first. */
    public function index(Request $request): JsonResponse
    {
        if (! $studentId = $this->ownStudentId($request)) {
            return $this->forbidden('Only students can open their report cards here.');
        }

        $cards = ReportCardPublication::query()
            ->with('classSection:id,title,grade_level,academic_year')
            ->where('student_id', $studentId)
            ->orderByDesc('academic_year')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (ReportCardPublication $card) => [
                'id' => $card->id,
                'card_type' => $card->card_type,
                'academic_year' => $card->academic_year,
                'published_at' => $card->created_at?->toIso8601String(),
                'class_section' => $card->classSection ? [
                    'id' => $card->classSection->id,
                    'title' => $card->classSection->title,
                    'grade_level' => $card->classSection->grade_level,
                ] : null,
            ]);

        return response()->json(['success' => true, 'data' => $cards]);
    }

    /** Everything one published card prints. */
    public function show(Request $request, string $id): JsonResponse
    {
        if (! $studentId = $this->ownStudentId($request)) {
            return $this->forbidden('Only students can open their report cards here.');
        }

        // Looked up under the caller's own id: another learner's publication,
        // or one that has been unpublished, is simply not found.
        $card = ReportCardPublication::query()
            ->where('student_id', $studentId)
            ->whereKey($id)
            ->first();

        $section = $card ? ClassSection::find($card->class_section_id) : null;

        if (! $card || ! $section) {
            return response()->json([
                'success' => false,
                'message' => 'This report card has not been published to you.',
            ], 404);
        }

        $template = app(ReportCardTemplateController::class)
            ->payloadForGradeLevel($section->institution_id, $section->grade_level);

        $base = [
            'id' => $card->id,
            'card_type' => $card->card_type,
            'academic_year' => $card->academic_year,
            'template' => $template,
        ];

        if ($card->card_type === ReportCardPublication::TYPE_MATATAG) {
            if ($deny = $this->resolvePin($section, $card->academic_year, $pin)) {
                return $deny;
            }

            $roster = $this->sectionRoster($section, $card->academic_year)
                ->filter(fn ($student) => $student->id === $studentId)
                ->values();

            if ($roster->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'You are no longer on this section\'s roster, so its card cannot be printed.',
                ], 404);
            }

            return response()->json(['success' => true, 'data' => $base + [
                'report' => $this->progressReport->compose($section, $pin, $card->academic_year, $roster),
            ]]);
        }

        $data = $base + [
            'principal_name' => $this->principalName($section->institution_id),
            'card' => $this->gradesCard($studentId, $section, $card->academic_year),
        ];

        if ($card->card_type === ReportCardPublication::TYPE_PERFORMANCE_REPORT) {
            // The adviser's comment per term, as the card prints it: only what
            // was saved, keyed by period ordinal.
            $data['comments'] = (object) StudentAdviserComment::query()
                ->where('student_id', $studentId)
                ->where('academic_year', $card->academic_year)
                ->pluck('comment', 'quarter')
                ->all();
            // DepEd's form leaves the School Head blank to sign by hand unless
            // the adviser picks one, so the portal leaves it blank too.
            $data['principal_name'] = '';
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * What `useStudentReportCard` fetches for the numeric cards, for this one
     * learner and section.
     *
     * @return array<string, mixed>
     */
    private function gradesCard(string $studentId, ClassSection $section, string $academicYear): array
    {
        $section->load([
            'adviserUser:id,first_name,middle_name,last_name,ext_name',
            'department',
            'track',
            'strand',
        ]);

        $institution = Institution::query()
            ->select(['id', 'title', 'abbr', 'address', 'division', 'region', 'gov_id', 'logo', 'default_department_id', 'current_academic_year'])
            ->find($section->institution_id);

        $subjects = Subject::with(['parentSubject', 'childSubjects', 'gradingScale.bands'])
            ->where('institution_id', $section->institution_id)
            ->where('class_section_id', $section->id)
            ->orderBy('order', 'asc')
            ->orderBy('created_at', 'desc')
            ->get();

        // Only this section's subjects: the cards match grades to subjects by
        // id, and another section's rows have no business in this payload.
        $grades = StudentRunningGrade::query()
            ->where('student_id', $studentId)
            ->whereIn('subject_id', $subjects->pluck('id'))
            ->get();

        $coreValueMarkings = CoreValueMarking::query()
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->get();

        $attendances = StudentAttendance::query()
            ->where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->where('student_id', $studentId)
            ->get();

        return [
            'student' => Student::with('profile')->find($studentId),
            'institution' => $institution,
            'class_section' => $section,
            'subjects' => $subjects,
            'grades' => $grades,
            'core_value_markings' => $coreValueMarkings,
            'attendances' => $attendances,
            'school_days' => $this->schoolDays($section, $institution, $academicYear),
        ];
    }

    /**
     * The section's school days, in the exact shape the staff card reads.
     *
     * Delegated rather than re-queried: `SchoolDayController::index` folds a
     * year into twelve Jun-May rows with gaps filled, and a second copy of
     * that rule is one that drifts. It reads nothing about the caller.
     */
    private function schoolDays(ClassSection $section, ?Institution $institution, string $academicYear): array
    {
        $params = array_filter([
            'institution_id' => $section->institution_id,
            'academic_year' => $academicYear,
            'department_id' => $section->department_id ?? $institution?->default_department_id,
        ]);

        $response = app(SchoolDayController::class)->index(Request::create('/', 'GET', $params));

        return $response->getStatusCode() === 200
            ? ($response->getData(true)['data'] ?? [])
            : [];
    }

    /**
     * The name the standard card prints over "Principal": the first principal
     * on the school's staff, by surname, which is what the adviser's modal
     * selects until someone picks another.
     */
    private function principalName(string $institutionId): string
    {
        $principal = User::query()
            ->whereHas('userInstitutions', fn ($q) => $q
                ->where('institution_id', $institutionId)
                ->whereHas('role', fn ($r) => $r->where('slug', 'principal')))
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->first(['id', 'first_name', 'middle_name', 'last_name', 'ext_name']);

        if (! $principal) {
            return '';
        }

        $middle = trim((string) $principal->middle_name);
        $base = implode(' ', array_filter([
            trim((string) $principal->first_name),
            $middle !== '' ? mb_substr($middle, 0, 1).'.' : '',
            trim((string) $principal->last_name),
        ]));
        $ext = trim((string) $principal->ext_name);

        return mb_strtoupper(trim($ext !== '' ? "{$base} {$ext}" : $base));
    }

    private function ownStudentId(Request $request): ?string
    {
        return $this->isStudentActor($request) ? $this->actingStudentId($request) : null;
    }
}
