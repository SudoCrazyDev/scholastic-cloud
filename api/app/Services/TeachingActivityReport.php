<?php

namespace App\Services;

use App\Models\AssessmentQuestion;
use App\Models\Student;
use App\Models\StudentAssessmentAttempt;
use App\Models\StudentLessonProgress;
use App\Models\Subject;
use App\Models\SubjectEcrItem;
use App\Models\Topic;
use App\Models\User;
use App\Models\UserInstitution;
use App\Support\AcademicYear;
use App\Support\MediaInventory;
use App\Support\SubjectRoster;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * What each teacher has put up, and how much of it their students have done.
 *
 * Reads the Subjects module's own tables — `topics` (lessons), `lesson_plans`,
 * `subject_ecr_items` (assessments) — and the student portal's
 * `student_assessment_attempts` / `student_lesson_progress`, and reports them
 * per teacher for an institution administrator or principal. It writes
 * nothing.
 *
 * Three things here are worth understanding before changing a number:
 *
 * **Attribution.** A lesson or assessment names its creator
 * (`created_by_user_id`), but only from 2026-09 onwards; everything older has
 * no creator recorded and falls back to the subject's current adviser. That
 * fallback is a guess and is labelled as one in the payload
 * (`attribution: 'recorded' | 'adviser'`) so a principal is never shown a
 * teacher's name as if the system had watched them type it.
 *
 * **The submission denominator.** Only *published* assessments that actually
 * carry questions are counted. Most `subject_ecr_items` rows are gradebook
 * columns for work done on paper — a project, a recitation — with nothing to
 * submit online; counting those would report every teacher in the school as
 * having a near-zero submission rate. Items published with no questions are
 * surfaced separately instead, because that one *is* worth someone's
 * attention.
 *
 * **Cost.** The overview covers every subject in a school, so it never loads a
 * `content` column: file counts come from a JSON expression evaluated in the
 * database (see LESSON_FILE_BLOCKS) and assessment uploads from a pattern test
 * on the stored URL. The per-teacher view is bounded to one person, so it
 * loads content and counts exactly, via MediaInventory. The two therefore
 * agree on lessons and can differ on assessment images — the overview knows
 * whether an assessment carries uploads, the detail knows how many.
 */
class TeachingActivityReport
{
    /**
     * Gradebook rows that represent something a teacher built. `other` and
     * untyped rows are left out: they are bookkeeping columns, not assessments.
     *
     * @var array<int, string>
     */
    public const ASSESSMENT_TYPES = ['quiz', 'activity', 'assignment', 'exam', 'project'];

    /**
     * How many uploaded attachments a lesson carries.
     *
     * Lesson content is a flat array of blocks and an upload is a `file` block,
     * so the count is the number of blocks whose `type` is "file".
     * `JSON_SEARCH(..., 'all', ...)` returns the matching paths — one JSON
     * string for a single hit, an array for several, NULL for none — and
     * `JSON_LENGTH` counts them (a scalar counts as 1).
     *
     * Evaluated in the database on purpose. The alternative is shipping every
     * lesson's rich text to PHP to count its attachments, which for a school
     * with a few thousand lessons is tens of megabytes per page load.
     */
    private const LESSON_FILE_BLOCKS = "COALESCE(JSON_LENGTH(JSON_SEARCH(topics.content, 'all', 'file', NULL, '$[*].type')), 0)";

    /**
     * Does this assessment reference an uploaded image?
     *
     * Assessment images live at `<institution>/assessments/images/<uuid>.<ext>`
     * and reach storage inside a URL, where the separator between the two
     * words arrives in one of three encodings: `/` from a public bucket URL,
     * `\/` once the JSON cast has escaped that slash, and `%2F` from the
     * signed media route, which percent-encodes the whole key.
     *
     * So the patterns differ only in how many characters sit between
     * "assessments" and "images", and `_` (any single character) is used for
     * them rather than the encodings themselves. Matching a literal backslash
     * through a LIKE means escaping it twice — once for the string literal and
     * once for LIKE's own escape character — and getting that wrong fails
     * silently as "no assessment in this school has a picture". One loose
     * `%assessments%images%` is the other thing to avoid: it also matches a
     * question that happens to use both words.
     */
    private const ASSESSMENT_FILE_PATTERNS = [
        '%assessments_images%',
        '%assessments__images%',
        '%assessments___images%',
    ];

    public function __construct(protected AssessmentScoringService $scoring) {}

    /**
     * Institution-wide: one row per teacher, plus school totals.
     *
     * @param  array{academic_year?: ?string, quarter?: ?string, department_id?: ?string, search?: ?string, sort?: ?string}  $filters
     */
    public function overview(string $institutionId, array $filters = []): array
    {
        $year = $this->resolveYear($institutionId, $filters);
        $quarter = $this->normalizeQuarter($filters['quarter'] ?? null);

        $subjects = $this->subjectsInScope($institutionId, $year, $filters['department_id'] ?? null);
        $subjectIds = $subjects->pluck('id')->all();
        $rosters = SubjectRoster::studentIdsForMany($subjects);

        $teachers = [];
        $this->foldLessons($teachers, $subjectIds, $quarter);
        $this->foldLessonPlans($teachers, $subjectIds, $quarter);
        $this->foldAssessments($teachers, $subjectIds, $year, $quarter, $rosters);

        // Every teacher with a subject appears even when they have posted
        // nothing at all. A blank row is the single most useful thing on this
        // screen, so it must not be the one thing an empty aggregate omits.
        foreach ($subjects as $subject) {
            if ($subject->adviser) {
                $this->touch($teachers, $subject->adviser, $subject->id);
            }
        }

        $rows = $this->presentTeachers($institutionId, $teachers, $subjects, $rosters);
        $rows = $this->applySearch($rows, $filters['search'] ?? null);
        $rows = $this->applySort($rows, $filters['sort'] ?? null);

        return [
            'academic_year' => $year,
            'quarter' => $quarter,
            'totals' => $this->schoolTotals($rows, $subjects),
            'teachers' => $rows,
        ];
    }

    /**
     * One teacher, in full: their subjects, every lesson and every assessment
     * credited to them, with exact upload counts and per-item submissions.
     *
     * @param  array{academic_year?: ?string, quarter?: ?string}  $filters
     * @return array<string, mixed>|null null when the user has nothing in this institution
     */
    public function forTeacher(string $institutionId, string $userId, array $filters = []): ?array
    {
        $year = $this->resolveYear($institutionId, $filters);
        $quarter = $this->normalizeQuarter($filters['quarter'] ?? null);

        $user = User::find($userId);
        if (! $user) {
            return null;
        }

        $allSubjects = $this->subjectsInScope($institutionId, $year, null);
        $allSubjectIds = $allSubjects->pluck('id')->all();

        // Their own load, plus any subject they have put something into —
        // a teacher who covered a colleague's class should not vanish from
        // their own page.
        $advisedIds = $allSubjects->where('adviser', $userId)->pluck('id');
        $contributedIds = collect()
            ->merge($this->subjectIdsWithLessonsBy($allSubjectIds, $userId, $quarter))
            ->merge($this->subjectIdsWithAssessmentsBy($allSubjectIds, $userId, $year, $quarter));

        $subjectIds = $advisedIds->merge($contributedIds)->unique()->values();
        $subjects = $allSubjects->whereIn('id', $subjectIds)->values();
        $rosters = SubjectRoster::studentIdsForMany($subjects);

        $lessons = $this->lessonsFor($subjects, $userId, $quarter, $rosters);
        $assessments = $this->assessmentsFor($subjects, $userId, $year, $quarter, $rosters);

        $teachers = [];
        $this->foldLessons($teachers, $subjects->pluck('id')->all(), $quarter, $userId);
        $this->foldLessonPlans($teachers, $subjects->pluck('id')->all(), $quarter, $userId);
        $this->foldAssessments($teachers, $subjects->pluck('id')->all(), $year, $quarter, $rosters, $userId);
        foreach ($advisedIds as $subjectId) {
            $this->touch($teachers, $userId, $subjectId);
        }

        $row = $this->presentTeachers($institutionId, $teachers, $subjects, $rosters)[0]
            ?? null;

        return [
            'academic_year' => $year,
            'quarter' => $quarter,
            'teacher' => $row ?? $this->emptyTeacherRow($institutionId, $user),
            'subjects' => $this->presentSubjects($subjects, $teachers[$userId]['subjects'] ?? [], $rosters, $userId),
            'lessons' => $lessons,
            'assessments' => $assessments,
        ];
    }

    /**
     * Who has and has not submitted one assessment.
     *
     * The roster is the whole list, so a student who never opened it is a row
     * here rather than an absence — the point of the screen is the people who
     * are missing.
     *
     * @return array<string, mixed>
     */
    public function assessmentSubmissions(SubjectEcrItem $item): array
    {
        $subject = $item->subjectEcr?->subject;
        $studentIds = SubjectRoster::studentIdsFor($subject);
        $questions = $item->resolvedQuestions();

        $students = Student::whereIn('id', $studentIds)
            ->get(['id', 'first_name', 'middle_name', 'last_name', 'ext_name', 'lrn'])
            ->keyBy('id');

        $attempts = StudentAssessmentAttempt::whereIn('student_id', $studentIds)
            ->where('subject_ecr_item_id', $item->id)
            ->orderByRaw('submitted_at IS NULL, submitted_at DESC')
            ->get()
            ->groupBy('student_id');

        $dueAt = $item->due_at ?? $item->close_at;

        $rows = $students->map(function (Student $student) use ($attempts, $dueAt) {
            $group = $attempts->get($student->id) ?? collect();
            $submitted = $group->first(fn (StudentAssessmentAttempt $a) => $a->submitted_at !== null);
            $inProgress = $group->first(fn (StudentAssessmentAttempt $a) => $a->submitted_at === null);

            return [
                'student_id' => $student->id,
                'name' => $this->studentName($student),
                'lrn' => $student->lrn,
                'status' => $submitted ? 'submitted' : ($inProgress ? 'in_progress' : 'not_started'),
                'score' => $submitted?->score !== null ? (float) $submitted->score : null,
                'max_score' => $submitted?->max_score !== null ? (float) $submitted->max_score : null,
                'submitted_at' => $submitted?->submitted_at?->toIso8601String(),
                'is_late' => $submitted && $dueAt ? $submitted->submitted_at->gt($dueAt) : false,
                'graded_at' => $submitted?->graded_at?->toIso8601String(),
                'attempts' => $group->whereNotNull('submitted_at')->count(),
            ];
        })->values()->sortBy('name')->values()->all();

        $submittedCount = collect($rows)->where('status', 'submitted')->count();

        return [
            'assessment' => [
                'id' => $item->id,
                'title' => $item->title,
                'type' => $item->type,
                'status' => $item->status,
                'quarter' => $item->quarter,
                'academic_year' => $item->academic_year,
                'question_count' => count($questions),
                'max_score' => (float) $this->scoring->maxScore($questions),
                'due_at' => $item->due_at?->toIso8601String(),
                'close_at' => $item->close_at?->toIso8601String(),
                'subject_title' => $subject?->title,
                'section_title' => $subject?->classSection?->title,
            ],
            'submissions' => [
                'expected' => count($studentIds),
                'received' => $submittedCount,
                'rate' => $this->rate($submittedCount, count($studentIds)),
                'in_progress' => collect($rows)->where('status', 'in_progress')->count(),
                'not_started' => collect($rows)->where('status', 'not_started')->count(),
                'late' => collect($rows)->where('is_late', true)->count(),
            ],
            'students' => $rows,
        ];
    }

    /**
     * Academic years the institution has sections for, newest first, with the
     * current one guaranteed present even before any section exists in it.
     *
     * @return array<int, string>
     */
    public function academicYears(string $institutionId): array
    {
        $years = DB::table('class_sections')
            ->where('institution_id', $institutionId)
            ->whereNotNull('academic_year')
            ->distinct()
            ->pluck('academic_year')
            ->push(AcademicYear::forInstitution($institutionId))
            ->filter()
            ->unique()
            ->sortDesc()
            ->values()
            ->all();

        return $years;
    }

    // ── Scope ───────────────────────────────────────────────────────────────

    /**
     * @param  array<string, mixed>  $filters
     */
    private function resolveYear(string $institutionId, array $filters): string
    {
        $requested = trim((string) ($filters['academic_year'] ?? ''));

        return $requested !== '' ? $requested : AcademicYear::forInstitution($institutionId);
    }

    private function normalizeQuarter(?string $quarter): ?string
    {
        $quarter = trim((string) $quarter);

        return $quarter === '' || $quarter === 'all' ? null : $quarter;
    }

    /**
     * Subjects of one institution in one academic year.
     *
     * Mirrors AcademicYear::forSubject: a subject's year is its class
     * section's, and a subject with no section belongs to the institution's
     * current year. Reading those two differently is how a subject ends up
     * counted in no year at all.
     *
     * @return Collection<int, Subject>
     */
    private function subjectsInScope(string $institutionId, string $year, ?string $departmentId): Collection
    {
        $isCurrentYear = $year === AcademicYear::forInstitution($institutionId);

        return Subject::with('classSection')
            ->where('institution_id', $institutionId)
            ->where(function ($query) use ($year, $isCurrentYear, $departmentId) {
                $query->whereHas('classSection', function ($section) use ($year, $departmentId) {
                    $section->where('academic_year', $year)
                        ->when($departmentId, fn ($q) => $q->where('department_id', $departmentId));
                });

                // A sectionless subject has no department either, so it only
                // belongs in an unfiltered list.
                if ($isCurrentYear && ! $departmentId) {
                    $query->orWhereNull('class_section_id');
                }
            })
            ->get();
    }

    // ── Aggregation ─────────────────────────────────────────────────────────

    /**
     * `COALESCE(<table>.<column>, subjects.adviser)` — the recorded creator,
     * falling back to the subject's adviser for rows written before creators
     * were kept.
     */
    private function creatorExpression(string $column): string
    {
        return "COALESCE({$column}, subjects.adviser)";
    }

    /**
     * @param  array<string, mixed>  $teachers
     * @param  array<int, string>  $subjectIds
     */
    private function foldLessons(array &$teachers, array $subjectIds, ?string $quarter, ?string $onlyUserId = null): void
    {
        if ($subjectIds === []) {
            return;
        }

        $creator = $this->creatorExpression('topics.created_by_user_id');
        $files = self::LESSON_FILE_BLOCKS;

        $rows = DB::table('topics')
            ->join('subjects', 'subjects.id', '=', 'topics.subject_id')
            ->whereIn('topics.subject_id', $subjectIds)
            ->when($quarter !== null, fn ($q) => $q->where('topics.quarter', $quarter))
            ->when($onlyUserId !== null, fn ($q) => $q->whereRaw("{$creator} = ?", [$onlyUserId]))
            ->selectRaw("{$creator} AS creator_id")
            ->selectRaw('topics.subject_id AS subject_id')
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw('SUM(CASE WHEN topics.is_published = 1 THEN 1 ELSE 0 END) AS published')
            ->selectRaw("SUM(CASE WHEN {$files} > 0 THEN 1 ELSE 0 END) AS with_files")
            ->selectRaw("SUM({$files}) AS files")
            ->selectRaw('SUM(CASE WHEN topics.created_by_user_id IS NULL THEN 1 ELSE 0 END) AS inherited')
            ->selectRaw('MAX(topics.updated_at) AS last_activity')
            ->groupByRaw("{$creator}, topics.subject_id")
            ->get();

        foreach ($rows as $row) {
            if (! $row->creator_id) {
                continue;
            }

            $this->add($teachers, $row->creator_id, $row->subject_id, function (array &$m) use ($row) {
                $m['lessons']['total'] += (int) $row->total;
                $m['lessons']['published'] += (int) $row->published;
                $m['lessons']['with_files'] += (int) $row->with_files;
                $m['lessons']['files'] += (int) $row->files;
                $m['inherited'] += (int) $row->inherited;
                $m['last_activity'] = $this->later($m['last_activity'], $row->last_activity);
            });
        }
    }

    /**
     * @param  array<string, mixed>  $teachers
     * @param  array<int, string>  $subjectIds
     */
    private function foldLessonPlans(array &$teachers, array $subjectIds, ?string $quarter, ?string $onlyUserId = null): void
    {
        if ($subjectIds === []) {
            return;
        }

        $creator = $this->creatorExpression('lesson_plans.generated_by_user_id');

        $rows = DB::table('lesson_plans')
            ->join('subjects', 'subjects.id', '=', 'lesson_plans.subject_id')
            ->whereIn('lesson_plans.subject_id', $subjectIds)
            ->when($quarter !== null, fn ($q) => $q->where('lesson_plans.quarter', $quarter))
            ->when($onlyUserId !== null, fn ($q) => $q->whereRaw("{$creator} = ?", [$onlyUserId]))
            ->selectRaw("{$creator} AS creator_id")
            ->selectRaw('lesson_plans.subject_id AS subject_id')
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw('MAX(lesson_plans.updated_at) AS last_activity')
            ->groupByRaw("{$creator}, lesson_plans.subject_id")
            ->get();

        foreach ($rows as $row) {
            if (! $row->creator_id) {
                continue;
            }

            $this->add($teachers, $row->creator_id, $row->subject_id, function (array &$m) use ($row) {
                $m['lesson_plans'] += (int) $row->total;
                $m['last_activity'] = $this->later($m['last_activity'], $row->last_activity);
            });
        }
    }

    /**
     * One row per assessment — small scalar columns only, never `content` —
     * folded into per-teacher and per-subject counts.
     *
     * @param  array<string, mixed>  $teachers
     * @param  array<int, string>  $subjectIds
     * @param  array<string, array<int, string>>  $rosters
     */
    private function foldAssessments(
        array &$teachers,
        array $subjectIds,
        string $year,
        ?string $quarter,
        array $rosters,
        ?string $onlyUserId = null
    ): void {
        if ($subjectIds === []) {
            return;
        }

        $items = $this->assessmentItemRows($subjectIds, $year, $quarter, $onlyUserId);
        if ($items->isEmpty()) {
            return;
        }

        $questionCounts = $this->questionCounts($items);
        $submitters = $this->submitterCounts($items->pluck('id')->all());

        foreach ($items as $item) {
            if (! $item->creator_id) {
                continue;
            }

            $questions = (int) $item->content_version === 2
                ? ($questionCounts[$item->id] ?? 0)
                : (int) $item->v1_questions;
            $isPublished = $this->isPublished($item->status);
            $isOnline = $isPublished && $questions > 0;
            $expected = $isOnline ? count($rosters[$item->subject_id] ?? []) : 0;

            // Clamped: a student who submitted and has since left the section
            // is in the numerator but not the roster, and a rate over 100%
            // reads as a bug rather than as the edge case it is. The
            // per-teacher view intersects properly and reports the exact set.
            $received = $isOnline ? min((int) ($submitters[$item->id] ?? 0), $expected) : 0;

            $this->add($teachers, $item->creator_id, $item->subject_id, function (array &$m) use (
                $item, $questions, $isPublished, $isOnline, $expected, $received
            ) {
                $m['assessments']['total']++;
                $m['assessments']['published'] += $isPublished ? 1 : 0;
                $m['assessments']['with_questions'] += $questions > 0 ? 1 : 0;
                $m['assessments']['with_files'] += $item->has_files ? 1 : 0;
                $m['assessments']['published_without_questions'] += $isPublished && $questions === 0 ? 1 : 0;
                $m['assessments']['online'] += $isOnline ? 1 : 0;
                $m['submissions']['expected'] += $expected;
                $m['submissions']['received'] += $received;
                $m['inherited'] += $item->created_by_user_id === null ? 1 : 0;
                $m['last_activity'] = $this->later($m['last_activity'], $item->updated_at);
            });
        }
    }

    /**
     * @param  array<int, string>  $subjectIds
     * @return Collection<int, object>
     */
    private function assessmentItemRows(array $subjectIds, string $year, ?string $quarter, ?string $onlyUserId = null): Collection
    {
        $creator = $this->creatorExpression('subject_ecr_items.created_by_user_id');
        [$filesExpression, $filesBindings] = $this->assessmentFilesExpression();

        return DB::table('subject_ecr_items')
            ->join('subjects_ecr', 'subjects_ecr.id', '=', 'subject_ecr_items.subject_ecr_id')
            ->join('subjects', 'subjects.id', '=', 'subjects_ecr.subject_id')
            ->whereIn('subjects_ecr.subject_id', $subjectIds)
            ->whereIn('subject_ecr_items.type', self::ASSESSMENT_TYPES)
            // Legacy items were written before the column existed. They belong
            // to whichever year their subject is in, which the subject scope
            // has already decided, so a null year is kept rather than dropped.
            ->where(fn ($q) => $q->where('subject_ecr_items.academic_year', $year)
                ->orWhereNull('subject_ecr_items.academic_year'))
            ->when($quarter !== null, fn ($q) => $q->where('subject_ecr_items.quarter', $quarter))
            ->when($onlyUserId !== null, fn ($q) => $q->whereRaw("{$creator} = ?", [$onlyUserId]))
            ->selectRaw('subject_ecr_items.id AS id')
            ->selectRaw('subjects_ecr.subject_id AS subject_id')
            ->selectRaw("{$creator} AS creator_id")
            ->selectRaw('subject_ecr_items.created_by_user_id AS created_by_user_id')
            ->selectRaw('subject_ecr_items.title AS title')
            ->selectRaw('subject_ecr_items.type AS type')
            ->selectRaw('subject_ecr_items.status AS status')
            ->selectRaw('subject_ecr_items.quarter AS quarter')
            ->selectRaw('subject_ecr_items.content_version AS content_version')
            ->selectRaw('subject_ecr_items.score AS score')
            ->selectRaw('subject_ecr_items.due_at AS due_at')
            ->selectRaw('subject_ecr_items.close_at AS close_at')
            ->selectRaw('subject_ecr_items.created_at AS created_at')
            ->selectRaw('subject_ecr_items.updated_at AS updated_at')
            ->selectRaw("COALESCE(JSON_LENGTH(JSON_EXTRACT(subject_ecr_items.content, '$.questions')), 0) AS v1_questions")
            ->selectRaw($filesExpression.' AS has_files', $filesBindings)
            ->get();
    }

    /**
     * A 1/0 flag for "references an uploaded image", with the patterns bound
     * rather than interpolated. See ASSESSMENT_FILE_PATTERNS.
     *
     * @return array{0: string, 1: array<int, string>} the expression and its bindings, in order
     */
    private function assessmentFilesExpression(): array
    {
        $clauses = [];
        $bindings = [];

        foreach (self::ASSESSMENT_FILE_PATTERNS as $pattern) {
            $clauses[] = 'subject_ecr_items.content LIKE ?';
            $bindings[] = $pattern;

            // v2 keeps its questions in rows, so the picture is over there.
            $clauses[] = 'EXISTS (SELECT 1 FROM assessment_questions aq'
                .' WHERE aq.subject_ecr_item_id = subject_ecr_items.id'
                .' AND aq.deleted_at IS NULL'
                .' AND (aq.question LIKE ? OR aq.config LIKE ?))';
            $bindings[] = $pattern;
            $bindings[] = $pattern;
        }

        return ['CASE WHEN '.implode(' OR ', $clauses).' THEN 1 ELSE 0 END', $bindings];
    }

    /**
     * Active v2 question counts, keyed by item id. v1 items count their
     * questions in SQL from the content JSON and are not queried here.
     *
     * @param  Collection<int, object>  $items
     * @return array<string, int>
     */
    private function questionCounts(Collection $items): array
    {
        $v2Ids = $items->where('content_version', 2)->pluck('id');

        if ($v2Ids->isEmpty()) {
            return [];
        }

        return AssessmentQuestion::whereIn('subject_ecr_item_id', $v2Ids)
            ->selectRaw('subject_ecr_item_id, COUNT(*) AS total')
            ->groupBy('subject_ecr_item_id')
            ->pluck('total', 'subject_ecr_item_id')
            ->map(fn ($total) => (int) $total)
            ->all();
    }

    /**
     * Distinct students who have submitted, keyed by item id.
     *
     * @param  array<int, string>  $itemIds
     * @return array<string, int>
     */
    private function submitterCounts(array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        return StudentAssessmentAttempt::whereIn('subject_ecr_item_id', $itemIds)
            ->whereNotNull('submitted_at')
            ->selectRaw('subject_ecr_item_id, COUNT(DISTINCT student_id) AS submitters')
            ->groupBy('subject_ecr_item_id')
            ->pluck('submitters', 'subject_ecr_item_id')
            ->map(fn ($count) => (int) $count)
            ->all();
    }

    // ── Accumulator ─────────────────────────────────────────────────────────

    /**
     * Make sure a teacher and one of their subjects have a row, without
     * changing either. This is what puts a teacher who has posted nothing on
     * the screen.
     *
     * @param  array<string, mixed>  $teachers
     */
    private function touch(array &$teachers, string $userId, string $subjectId): void
    {
        $teachers[$userId] ??= $this->emptyMetrics() + ['subjects' => []];
        $teachers[$userId]['subjects'][$subjectId] ??= $this->emptyMetrics();
    }

    /**
     * Apply one set of counts to both places it belongs: the teacher's total
     * and their row for this subject. `$mutate` takes the metrics array by
     * reference and is called once for each.
     *
     * @param  array<string, mixed>  $teachers
     * @param  callable(array): void  $mutate
     */
    private function add(array &$teachers, string $userId, string $subjectId, callable $mutate): void
    {
        $this->touch($teachers, $userId, $subjectId);

        $mutate($teachers[$userId]);
        $mutate($teachers[$userId]['subjects'][$subjectId]);
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyMetrics(): array
    {
        return [
            'lessons' => ['total' => 0, 'published' => 0, 'with_files' => 0, 'files' => 0],
            'assessments' => [
                'total' => 0,
                'published' => 0,
                'with_questions' => 0,
                'with_files' => 0,
                'published_without_questions' => 0,
                'online' => 0,
            ],
            'lesson_plans' => 0,
            'submissions' => ['expected' => 0, 'received' => 0],
            'inherited' => 0,
            'last_activity' => null,
        ];
    }

    // ── Presentation ────────────────────────────────────────────────────────

    /**
     * @param  array<string, mixed>  $teachers
     * @param  Collection<int, Subject>  $subjects
     * @param  array<string, array<int, string>>  $rosters
     * @return array<int, array<string, mixed>>
     */
    private function presentTeachers(string $institutionId, array $teachers, Collection $subjects, array $rosters): array
    {
        $users = User::whereIn('id', array_keys($teachers))->get()->keyBy('id');
        $roles = $this->roleTitles($institutionId, array_keys($teachers));
        $advisedBy = $subjects->whereNotNull('adviser')->groupBy('adviser');

        $rows = [];

        foreach ($teachers as $userId => $metrics) {
            $user = $users->get($userId);
            if (! $user) {
                continue;
            }

            $advised = $advisedBy->get($userId) ?? collect();
            $perSubject = $metrics['subjects'];

            $rows[] = [
                'user_id' => $userId,
                'name' => $this->userName($user),
                'email' => $user->email,
                'role' => $roles[$userId] ?? null,
                'subjects_count' => $advised->count(),
                'students_count' => $advised
                    ->flatMap(fn (Subject $subject) => $rosters[$subject->id] ?? [])
                    ->unique()
                    ->count(),
                'lessons' => $metrics['lessons'],
                'assessments' => $metrics['assessments'],
                'lesson_plans' => $metrics['lesson_plans'],
                'submissions' => [
                    'expected' => $metrics['submissions']['expected'],
                    'received' => $metrics['submissions']['received'],
                    'rate' => $this->rate($metrics['submissions']['received'], $metrics['submissions']['expected']),
                ],
                // Their own subjects with nothing in them yet. Only advised
                // subjects count: a teacher is not answerable for a colleague's
                // empty subject just because they helped out in it once.
                'empty_subjects' => [
                    'lessons' => $advised
                        ->filter(fn (Subject $s) => (($perSubject[$s->id]['lessons']['total'] ?? 0) === 0))
                        ->count(),
                    'assessments' => $advised
                        ->filter(fn (Subject $s) => (($perSubject[$s->id]['assessments']['total'] ?? 0) === 0))
                        ->count(),
                ],
                'last_activity_at' => $this->iso($metrics['last_activity']),
                // How much of the above was credited by falling back to the
                // subject's adviser rather than read off a recorded creator.
                'attribution' => $metrics['inherited'] > 0 ? 'adviser' : 'recorded',
            ];
        }

        return $rows;
    }

    /**
     * @param  Collection<int, Subject>  $subjects
     * @param  array<string, array<string, mixed>>  $perSubject
     * @param  array<string, array<int, string>>  $rosters
     * @return array<int, array<string, mixed>>
     */
    private function presentSubjects(Collection $subjects, array $perSubject, array $rosters, string $userId): array
    {
        return $subjects->map(function (Subject $subject) use ($perSubject, $rosters, $userId) {
            $metrics = $perSubject[$subject->id] ?? $this->emptyMetrics();

            return [
                'subject_id' => $subject->id,
                'title' => $subject->title,
                'variant' => $subject->variant,
                'section_title' => $subject->classSection?->title,
                'grade_level' => $subject->classSection?->grade_level,
                'is_adviser' => $subject->adviser === $userId,
                'students_count' => count($rosters[$subject->id] ?? []),
                'lessons' => $metrics['lessons'],
                'assessments' => $metrics['assessments'],
                'lesson_plans' => $metrics['lesson_plans'],
                'submissions' => [
                    'expected' => $metrics['submissions']['expected'],
                    'received' => $metrics['submissions']['received'],
                    'rate' => $this->rate($metrics['submissions']['received'], $metrics['submissions']['expected']),
                ],
                'last_activity_at' => $this->iso($metrics['last_activity']),
            ];
        })
            ->sortBy([['grade_level', 'asc'], ['title', 'asc']])
            ->values()
            ->all();
    }

    /**
     * Every lesson credited to this teacher, with its attachments named and
     * its per-student progress.
     *
     * @param  Collection<int, Subject>  $subjects
     * @param  array<string, array<int, string>>  $rosters
     * @return array<int, array<string, mixed>>
     */
    private function lessonsFor(Collection $subjects, string $userId, ?string $quarter, array $rosters): array
    {
        if ($subjects->isEmpty()) {
            return [];
        }

        $subjectsById = $subjects->keyBy('id');
        $advisedIds = $subjectsById->where('adviser', $userId)->keys()->all();

        $topics = Topic::whereIn('subject_id', $subjectsById->keys())
            ->when($quarter !== null, fn ($q) => $q->where('quarter', $quarter))
            ->where(function ($query) use ($userId, $advisedIds) {
                $query->where('created_by_user_id', $userId);

                // Unattributed lessons are credited to the adviser, the same
                // fallback the aggregates use — so the list and the count on
                // the row above it cannot disagree.
                if ($advisedIds !== []) {
                    $query->orWhere(fn ($q) => $q->whereNull('created_by_user_id')
                        ->whereIn('subject_id', $advisedIds));
                }
            })
            ->orderBy('subject_id')
            ->orderBy('order')
            ->get();

        $progress = $this->lessonProgress($topics->pluck('id')->all());

        return $topics->map(function (Topic $topic) use ($subjectsById, $progress, $rosters) {
            $subject = $subjectsById->get($topic->subject_id);
            $expected = count($rosters[$topic->subject_id] ?? []);
            $seen = $progress[$topic->id] ?? ['started' => 0, 'completed' => 0];

            return [
                'id' => $topic->id,
                'title' => $topic->title,
                'quarter' => $topic->quarter,
                'subject_id' => $topic->subject_id,
                'subject_title' => $subject?->title,
                'section_title' => $subject?->classSection?->title,
                'is_published' => (bool) $topic->is_published,
                'files' => $this->lessonFiles($topic),
                'progress' => [
                    'expected' => $expected,
                    'started' => min($seen['started'], $expected),
                    'completed' => min($seen['completed'], $expected),
                    'rate' => $this->rate(min($seen['completed'], $expected), $expected),
                ],
                'attribution' => $topic->created_by_user_id ? 'recorded' : 'adviser',
                'created_at' => $topic->created_at?->toIso8601String(),
                'updated_at' => $topic->updated_at?->toIso8601String(),
            ];
        })->all();
    }

    /**
     * Named attachments for one lesson. Uses the model's own URL rebuilding so
     * a link on this screen behaves like a link on the lesson itself.
     *
     * @return array<int, array<string, mixed>>
     */
    private function lessonFiles(Topic $topic): array
    {
        return collect($topic->contentWithFreshUrls())
            ->filter(fn ($block) => ($block['type'] ?? null) === 'file')
            ->map(fn ($block) => [
                'name' => $block['name'] ?? 'Attachment',
                'url' => $block['url'] ?? null,
                'mime' => $block['mime'] ?? null,
                'size' => $block['size'] ?? null,
            ])
            ->values()
            ->all();
    }

    /**
     * @param  array<int, string>  $topicIds
     * @return array<string, array{started: int, completed: int}>
     */
    private function lessonProgress(array $topicIds): array
    {
        if ($topicIds === []) {
            return [];
        }

        return StudentLessonProgress::whereIn('topic_id', $topicIds)
            ->selectRaw('topic_id')
            ->selectRaw("COUNT(DISTINCT CASE WHEN status <> 'not_started' OR started_at IS NOT NULL THEN student_id END) AS started")
            ->selectRaw("COUNT(DISTINCT CASE WHEN status = 'completed' OR completed_at IS NOT NULL THEN student_id END) AS completed")
            ->groupBy('topic_id')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->topic_id => [
                'started' => (int) $row->started,
                'completed' => (int) $row->completed,
            ]])
            ->all();
    }

    /**
     * Every assessment credited to this teacher, with exact upload counts and
     * its own submission figures.
     *
     * @param  Collection<int, Subject>  $subjects
     * @param  array<string, array<int, string>>  $rosters
     * @return array<int, array<string, mixed>>
     */
    private function assessmentsFor(Collection $subjects, string $userId, string $year, ?string $quarter, array $rosters): array
    {
        if ($subjects->isEmpty()) {
            return [];
        }

        $subjectsById = $subjects->keyBy('id');
        $rows = $this->assessmentItemRows($subjectsById->keys()->all(), $year, $quarter, $userId);

        if ($rows->isEmpty()) {
            return [];
        }

        // One teacher's worth of assessments, so loading the models (and with
        // them the content and question rows) is bounded — this is where the
        // exact upload count comes from.
        $items = SubjectEcrItem::with(['questions', 'subjectEcr'])
            ->whereIn('id', $rows->pluck('id'))
            ->get()
            ->keyBy('id');

        $attempts = $this->attemptBreakdown($rows->pluck('id')->all());

        return $rows->map(function ($row) use ($items, $subjectsById, $rosters, $attempts) {
            $item = $items->get($row->id);
            if (! $item) {
                return null;
            }

            $subject = $subjectsById->get($row->subject_id);
            $questions = $item->resolvedQuestions();
            $isPublished = $this->isPublished($item->status);
            $isOnline = $isPublished && $questions !== [];

            $roster = $rosters[$row->subject_id] ?? [];
            $breakdown = $attempts[$row->id] ?? ['submitters' => [], 'ungraded' => 0];
            // Intersected rather than clamped: with one teacher's items in
            // hand there is no reason to guess at who the submitters were.
            $received = count(array_intersect($roster, $breakdown['submitters']));

            return [
                'id' => $item->id,
                'title' => $item->title,
                'type' => $item->type,
                'status' => $item->status,
                'quarter' => $item->quarter,
                'subject_id' => $row->subject_id,
                'subject_title' => $subject?->title,
                'section_title' => $subject?->classSection?->title,
                'component_title' => $item->subjectEcr?->title,
                'question_count' => count($questions),
                'max_score' => (float) $this->scoring->maxScore($questions),
                'files' => MediaInventory::countIn($this->uploadHaystack($item)),
                'is_online' => $isOnline,
                'due_at' => $item->due_at?->toIso8601String(),
                'submissions' => [
                    'expected' => $isOnline ? count($roster) : 0,
                    'received' => $isOnline ? $received : 0,
                    'rate' => $isOnline ? $this->rate($received, count($roster)) : null,
                    'pending_grading' => $this->needsManualGrading($questions) ? $breakdown['ungraded'] : 0,
                ],
                'attribution' => $row->created_by_user_id ? 'recorded' : 'adviser',
                'created_at' => $item->created_at?->toIso8601String(),
                'updated_at' => $item->updated_at?->toIso8601String(),
            ];
        })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * Everywhere an assessment can be holding an uploaded image: the content
     * JSON for v1, the question rows for v2.
     */
    private function uploadHaystack(SubjectEcrItem $item): array
    {
        return [
            'content' => $item->content,
            'questions' => $item->isV2()
                ? $item->questions->map(fn (AssessmentQuestion $q) => [
                    'question' => $q->question,
                    'config' => $q->config,
                ])->all()
                : [],
        ];
    }

    /**
     * Submitting students and ungraded submissions, per item.
     *
     * @param  array<int, string>  $itemIds
     * @return array<string, array{submitters: array<int, string>, ungraded: int}>
     */
    private function attemptBreakdown(array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        $rows = StudentAssessmentAttempt::whereIn('subject_ecr_item_id', $itemIds)
            ->whereNotNull('submitted_at')
            ->get(['subject_ecr_item_id', 'student_id', 'graded_at'])
            ->groupBy('subject_ecr_item_id');

        return $rows->map(fn (Collection $group) => [
            'submitters' => $group->pluck('student_id')->unique()->values()->all(),
            'ungraded' => $group->whereNull('graded_at')->pluck('student_id')->unique()->count(),
        ])->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $questions
     */
    private function needsManualGrading(array $questions): bool
    {
        foreach ($questions as $question) {
            if ($this->scoring->isManualQuestion($question)) {
                return true;
            }
        }

        return false;
    }

    // ── Totals, filtering, sorting ──────────────────────────────────────────

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  Collection<int, Subject>  $subjects
     * @return array<string, mixed>
     */
    private function schoolTotals(array $rows, Collection $subjects): array
    {
        $sum = fn (callable $pick) => array_sum(array_map($pick, $rows));

        $expected = $sum(fn ($row) => $row['submissions']['expected']);
        $received = $sum(fn ($row) => $row['submissions']['received']);

        return [
            'teachers' => count($rows),
            'subjects' => $subjects->count(),
            'lessons' => $sum(fn ($row) => $row['lessons']['total']),
            'lessons_published' => $sum(fn ($row) => $row['lessons']['published']),
            'lesson_files' => $sum(fn ($row) => $row['lessons']['files']),
            'lesson_plans' => $sum(fn ($row) => $row['lesson_plans']),
            'assessments' => $sum(fn ($row) => $row['assessments']['total']),
            'assessments_published' => $sum(fn ($row) => $row['assessments']['published']),
            'assessments_with_files' => $sum(fn ($row) => $row['assessments']['with_files']),
            'assessments_published_without_questions' => $sum(fn ($row) => $row['assessments']['published_without_questions']),
            'teachers_with_nothing' => count(array_filter(
                $rows,
                fn ($row) => $row['lessons']['total'] === 0 && $row['assessments']['total'] === 0
            )),
            'expected_submissions' => $expected,
            'submissions_received' => $received,
            'submission_rate' => $this->rate($received, $expected),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function applySearch(array $rows, ?string $search): array
    {
        $term = trim((string) $search);
        if ($term === '') {
            return $rows;
        }

        $needle = mb_strtolower($term);

        return array_values(array_filter($rows, fn ($row) => str_contains(mb_strtolower((string) $row['name']), $needle)
            || str_contains(mb_strtolower((string) $row['email']), $needle)
            || str_contains(mb_strtolower((string) $row['role']), $needle)));
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function applySort(array $rows, ?string $sort): array
    {
        // Nulls last for the two "least done" sorts, so a teacher who has
        // posted nothing sorts as nothing rather than as zero-of-zero.
        $keys = [
            'name' => fn ($row) => mb_strtolower((string) $row['name']),
            'lessons' => fn ($row) => -$row['lessons']['total'],
            'assessments' => fn ($row) => -$row['assessments']['total'],
            'submission_rate' => fn ($row) => $row['submissions']['rate'] ?? 101,
            'last_activity' => fn ($row) => $row['last_activity_at'] ?? '',
        ];

        $key = $keys[$sort ?? 'name'] ?? $keys['name'];

        usort($rows, function ($a, $b) use ($key) {
            $result = $key($a) <=> $key($b);

            return $result !== 0 ? $result : (mb_strtolower((string) $a['name']) <=> mb_strtolower((string) $b['name']));
        });

        return $rows;
    }

    // ── Small helpers ───────────────────────────────────────────────────────

    /**
     * Legacy items carry a NULL status and behave as published, exactly as the
     * student-facing list treats them.
     */
    private function isPublished(?string $status): bool
    {
        return $status === null || $status === 'published';
    }

    private function rate(int $received, int $expected): ?float
    {
        return $expected > 0 ? round($received / $expected * 100, 1) : null;
    }

    private function later(?string $current, mixed $candidate): ?string
    {
        $candidate = $candidate === null ? null : (string) $candidate;

        if ($candidate === null || $candidate === '') {
            return $current;
        }

        return $current === null || $candidate > $current ? $candidate : $current;
    }

    private function iso(?string $timestamp): ?string
    {
        return $timestamp === null ? null : \Illuminate\Support\Carbon::parse($timestamp)->toIso8601String();
    }

    /**
     * @param  array<int, string>  $userIds
     * @return array<string, string>
     */
    private function roleTitles(string $institutionId, array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        return UserInstitution::with('role')
            ->where('institution_id', $institutionId)
            ->whereIn('user_id', $userIds)
            ->get()
            ->groupBy('user_id')
            ->map(fn (Collection $group) => ($group->firstWhere('is_default', true) ?? $group->first())?->role?->title)
            ->filter()
            ->all();
    }

    private function userName(User $user): string
    {
        return trim(implode(' ', array_filter([
            $user->first_name,
            $user->middle_name,
            $user->last_name,
            $user->ext_name,
        ])));
    }

    private function studentName(Student $student): string
    {
        return trim(implode(' ', array_filter([
            $student->first_name,
            $student->middle_name,
            $student->last_name,
            $student->ext_name,
        ])));
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyTeacherRow(string $institutionId, User $user): array
    {
        return [
            'user_id' => $user->id,
            'name' => $this->userName($user),
            'email' => $user->email,
            'role' => $this->roleTitles($institutionId, [$user->id])[$user->id] ?? null,
            'subjects_count' => 0,
            'students_count' => 0,
            'lessons' => ['total' => 0, 'published' => 0, 'with_files' => 0, 'files' => 0],
            'assessments' => [
                'total' => 0, 'published' => 0, 'with_questions' => 0,
                'with_files' => 0, 'published_without_questions' => 0, 'online' => 0,
            ],
            'lesson_plans' => 0,
            'submissions' => ['expected' => 0, 'received' => 0, 'rate' => null],
            'empty_subjects' => ['lessons' => 0, 'assessments' => 0],
            'last_activity_at' => null,
            'attribution' => 'recorded',
        ];
    }

    /**
     * @param  array<int, string>  $subjectIds
     * @return array<int, string>
     */
    private function subjectIdsWithLessonsBy(array $subjectIds, string $userId, ?string $quarter): array
    {
        if ($subjectIds === []) {
            return [];
        }

        return Topic::whereIn('subject_id', $subjectIds)
            ->where('created_by_user_id', $userId)
            ->when($quarter !== null, fn ($q) => $q->where('quarter', $quarter))
            ->distinct()
            ->pluck('subject_id')
            ->all();
    }

    /**
     * @param  array<int, string>  $subjectIds
     * @return array<int, string>
     */
    private function subjectIdsWithAssessmentsBy(array $subjectIds, string $userId, string $year, ?string $quarter): array
    {
        if ($subjectIds === []) {
            return [];
        }

        return DB::table('subject_ecr_items')
            ->join('subjects_ecr', 'subjects_ecr.id', '=', 'subject_ecr_items.subject_ecr_id')
            ->whereIn('subjects_ecr.subject_id', $subjectIds)
            ->where('subject_ecr_items.created_by_user_id', $userId)
            ->whereIn('subject_ecr_items.type', self::ASSESSMENT_TYPES)
            ->where(fn ($q) => $q->where('subject_ecr_items.academic_year', $year)
                ->orWhereNull('subject_ecr_items.academic_year'))
            ->when($quarter !== null, fn ($q) => $q->where('subject_ecr_items.quarter', $quarter))
            ->distinct()
            ->pluck('subjects_ecr.subject_id')
            ->all();
    }
}
