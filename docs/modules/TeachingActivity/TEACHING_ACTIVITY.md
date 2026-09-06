# Teaching Activity

Oversight, for an institution administrator or principal, of what each teacher has put up for
their subjects — lessons, the files uploaded to them, and assessments — and of how many of their
students have actually submitted.

**Read-only.** The module owns no data. Every figure on the screen belongs to another module —
Subjects writes the lessons and assessments, the student portal writes the submissions — so
Teaching Activity has no `manage` ability, and each of its three endpoints is a `GET`. The only
thing it added to the schema is *who made this*, which is the one question none of the existing
tables could answer.

## File map

| Path | What it is |
|---|---|
| `api/config/modules.php` | `teaching-activity` under the `academics` group. `'base_abilities' => ['view']` — no Manage, so the role builder draws one box, not two. |
| `api/app/Support/SystemRolePermissions.php` | In `VIEW` for `institution-administrator` and `principal`. |
| `api/database/migrations/2026_09_07_000001_add_created_by_to_lessons_and_assessments.php` | `topics.created_by_user_id`, `subject_ecr_items.created_by_user_id`. **Not backfilled** — see [Attribution](#attribution). |
| `api/database/migrations/2026_09_07_000002_grant_teaching_activity_permission.php` | Grants `teaching-activity.view` to existing tenants' principal / administrator roles. Without it the screen ships switched off everywhere. |
| `api/app/Services/TeachingActivityReport.php` | All of the aggregation. Read the class docblock before changing a number. |
| `api/app/Http/Controllers/TeachingActivityController.php` | Thin: resolves the institution, validates filters, delegates. |
| `api/app/Support/SubjectRoster.php` | **Shared.** Who is expected in a subject. Also now the single source for `AssessmentGradingController::expectedStudentCount()`. |
| `api/app/Support/MediaInventory.php` | **Shared.** Which uploaded objects a content tree references, found by walking it rather than by naming keys. |
| `api/routes/api.php` | `teaching-activity/overview`, `/teachers/{userId}`, `/assessments/{itemId}/submissions` — all `module:teaching-activity,view`. |
| `api/tests/Feature/TeachingActivityMonitorTest.php` | 13 cases, weighted towards the numbers that would misrepresent a teacher. |
| `app/src/pages/TeachingActivity/TeachingActivity.tsx` | The overview: school totals, two warning tiles, one row per teacher. |
| `app/src/pages/TeachingActivity/TeacherActivityDetail.tsx` | One teacher: Lessons / Assessments / Subjects tabs. Year + period live in the URL. |
| `app/src/pages/TeachingActivity/components/ActivityPrimitives.tsx` | `StatTile`, `RateBar`, `Count`, `AttributionNote`. |
| `app/src/pages/TeachingActivity/components/SubmissionRosterModal.tsx` | Who has and has not submitted one assessment. |
| `app/src/pages/TeachingActivity/activityFormat.ts` | `formatWhen` — "Never" rather than a dash, because on this screen that is the finding. |
| `app/src/services/teachingActivityService.ts`, `app/src/hooks/useTeachingActivity.ts` | Service + three hooks. |
| `app/src/App.tsx`, `app/src/components/sidebar/Sidebar.tsx` | `/teaching-activity`, `/teaching-activity/:userId`; nav entry under Academics. |
| `app/src/types/index.ts` | `TeachingActivity*` types, at the end of the file. |

## The two gates

`teaching-activity` is its own module and is deliberately **not** folded into `subjects`.

A subject teacher holds `subjects.manage` for their own work; reading the whole school's output is a
different question. The nearest existing permission is `subjects.view-all`, which department heads
also hold — and whether a department head should see every teacher in the school is a decision for
the school to make in its own role builder, not one to make for them by reusing a permission.

The module has no Manage. A principal who wants to change something opens the screen that owns it.

## Attribution

`topics` and `subject_ecr_items` now carry `created_by_user_id`, set from the session at every
creation path:

| Path | Credited to |
|---|---|
| `TopicController::store`, `TopicBulkController::store` | The signed-in user |
| `TopicController::copyToSubjects`, `SubjectEcrItemController::copyToSubjects` | Whoever pressed Copy — a copy is a new lesson in a new subject |
| `SubjectEcrItemController::store` | The signed-in user |
| `AiPlannerController::generateAssessments` | The teacher who asked. "The AI" is not a person a principal can talk to |
| `Tala\Assessments\ProposalApplier::create` | The teacher who approved the draft. Tala only ever proposes |
| `lesson_plans` | Already had `generated_by_user_id`; the generator passes the requesting user |

The column is **absent from `$fillable` on purpose**. The topic and ECR-item endpoints mass-assign
the request, so a fillable creator column would let a client credit its work to a colleague — there
is a test for exactly that.

**Nothing was backfilled.** Writing the current adviser into every existing row would state as fact
something nobody recorded, and would be wrong precisely for the subjects that changed hands — the
ones a principal is most likely to be looking at. Old rows stay `NULL`, the report falls back to
`subjects.adviser` at read time, and every payload that used the fallback carries
`attribution: 'adviser'`, which the UI renders as an *inferred* chip. A guess is shown as a guess.

## What the numbers mean

**The submission denominator is narrower than "assessments".** Only *published* assessments that
carry at least one question count. Most `subject_ecr_items` rows are gradebook columns for work done
on paper — a project, a recitation — with nothing to submit online; counting those would report
every teacher in the school as having a near-zero submission rate. Assessments published with
nothing to answer are surfaced on their own instead (`published_without_questions`), because that
one *is* worth someone's attention.

**A rate of `null` is not zero.** `null` means nothing was ever expected. The UI draws it as a dash.
Rendering it as 0% would accuse a teacher of a class that never handed anything in when in fact
nothing was set.

**Lesson file counts are exact; assessment file counts differ by screen.** The overview covers every
subject in a school and so never loads a `content` column — lesson attachments are counted by a
JSON expression in the database (`LESSON_FILE_BLOCKS`, verified against a PHP count of the same
rows), and assessment uploads by a `LIKE` test that answers *whether* an assessment has images. The
per-teacher view is bounded to one person, loads content, and counts assessment images exactly via
`MediaInventory`. So the two agree on lessons and are deliberately coarser/finer on assessment
images.

**Academic year comes from the class section**, mirroring `AcademicYear::forSubject`; a subject with
no section belongs to the institution's current year. Reading those two differently is how a subject
ends up counted in no year at all. Assessment items with a `NULL` `academic_year` are kept rather
than dropped — the subject scope has already placed them.

**Rates cannot exceed 100%.** A student who submitted and has since left the section is in the
numerator but not the roster. The overview clamps; the per-teacher view intersects the roster with
the actual submitters and is exact.

## Integration

**Consumes** (schema changes here will break this screen):

- `topics` — `quarter`, `is_published`, `content` (a flat array of blocks; a `file` block is an
  upload), `created_by_user_id`, `updated_at`. A change to the block shape changes the file count.
- `subject_ecr_items` — `type`, `status` (`NULL` behaves as published, as it does for students),
  `quarter`, `academic_year`, `content.questions` for v1, `content_version`.
- `assessment_questions` — v2 question rows, and the `question` / `config` columns where a v2
  assessment's images live.
- `student_assessment_attempts` — `submitted_at`, `graded_at`, `student_id`.
- `student_lesson_progress` — `status` / `completed_at`, for the per-lesson read rate.
- `lesson_plans` — `generated_by_user_id`, `quarter`.
- `subjects.adviser` — both the teacher roster and the attribution fallback.

**Provides**: `App\Support\SubjectRoster` and `App\Support\MediaInventory` are general-purpose and
meant to be reused. `SubjectRoster` in particular is now the *only* implementation of "who is
expected in this subject" on the staff side — `AssessmentGradingController` delegates to it, and the
student-side mirror is `ResolvesStudentSubjects`. Keep the two in agreement: a submission rate whose
denominator counts students the portal would never show the assessment to reads as a teacher's
failure when it is arithmetic.

**Institution clean-up**: no new tables and no new upload columns, so
`InstitutionCleanupGroups` / `InstitutionDataCleaner::FILE_COLUMNS` need nothing. The two new
columns are `users` FKs with `nullOnDelete`, and a clean-up keeps staff.

## Not yet wired

- **No department or grade-level filter in the UI.** The API accepts `department_id` (filtering
  subjects by their class section's department) and it is tested by nothing; the overview screen
  offers only year, period, search and sort. A school large enough to want it should get a
  department picker fed from `/api/departments`.
- **No export.** A principal wanting this in a meeting has to screenshot it.
- **`pending_grading` counts manual-only question types** (`essay`, `image_upload`, `video_upload`).
  A `short_answer` with no answer key is also graded by hand and is not counted here, so the figure
  is a floor, not a total. It appears in the per-teacher view only.
- **No trend over time.** Every figure is a snapshot of the selected year/period; there is nothing
  that says whether a teacher is posting more or less than last quarter.
- **Lesson read rates count `student_lesson_progress` rows**, which only exist once a student opens
  a lesson in the portal. A school not using the student portal will see every lesson at 0%.
