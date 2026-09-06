# Institution Clean-up

Platform administration. Empties **one institution back to its people**: a run deletes that
tenant's academic, finance, HRIS, device and messaging records across *every* academic year it
has, and keeps its students and staff.

Super-administrator only, and platform-only — a school can neither see nor be granted this.

> **This is the most destructive operation on the platform.** There is no undo, no year to
> restrict it to, and no soft delete. Take a database backup before running it.

## What it is for

A school that has finished a pilot, been keyed in twice, or is being handed to a new set of staff
needs its slate wiped without losing the people on it. Re-creating the tenant would mean
re-entering every student and every staff record; deleting rows by hand on a console means getting
98 tables and their delete order right under pressure.

## The promise

After a clean-up of every group the institution still has:

- its **students** — records, enrolment in this school, profiles, guardians, emergency contacts,
  health records, uploaded documents, RFID tags and portal logins;
- its **staff** — logins, institution membership, assigned role, and every personal-information
  record (addresses, family, children, education, eligibility, work experience);
- **itself** — the institution record, branding, academic years, feature access, subscription and
  payment gateway configuration;
- **platform-wide records** — `grade_levels` and system roles are shared by every tenant and are
  never touched;
- **audit trails** — `finance_data_clear_logs`, `student_auth_logs` and the clean-up history.

A student therefore stays **enrolled** but ends up **unassigned**: their section and subject rows go
with the sections and subjects themselves. That is the intended end state — a real roster of
people, ready to be organised again from scratch.

The API reports the promise as a number (`retained.students`, `retained.staff`), and the controller
logs those counts either side of the run, so it is checkable rather than taken on trust.

## File map

| File | What it is |
|---|---|
| `api/app/Support/InstitutionCleanupGroups.php` | **Single source of truth.** The 12 groups, their tables in delete order, per-table scoping, extra conditions, dependency hazards, and the kept list. |
| `api/app/Services/Institution/InstitutionDataCleaner.php` | Counts (`preview`) and deletes (`clear`) from those rules, in a transaction, plus the R2 sweep and `retainedPeople()`. |
| `api/app/Http/Controllers/InstitutionCleanupController.php` | `groups` / `preview` / `store` / `history`. Checks the super-administrator slug on every endpoint. |
| `api/app/Models/InstitutionCleanupLog.php` | One completed run. |
| `api/database/migrations/2026_09_07_100000_create_institution_cleanup_logs_table.php` | `institution_cleanup_logs`. |
| `api/routes/api.php` | Four routes behind `module:institution-cleanup,manage`. |
| `api/config/modules.php` | `administration.institution-cleanup`, `system_only`. |
| `api/tests/Feature/InstitutionCleanupTest.php` | Who may run it, what survives, whose data it was. |
| `app/src/pages/InstitutionCleanup/InstitutionCleanup.tsx` | The three-step screen. |
| `app/src/services/institutionCleanupService.ts` | Typed client. |
| `app/src/types/index.ts` | `InstitutionCleanup*` types. |
| `app/src/App.tsx`, `app/src/components/sidebar/Sidebar.tsx` | Route + nav entry, both `RequireModule module="institution-cleanup"`. |

### API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/institution-cleanup/groups` | Catalog, kept list, and the institutions to choose from. |
| POST | `/api/institution-cleanup/{institutionId}/preview` | Row counts + blockers. A POST only because it carries an array of group keys — it reads. |
| POST | `/api/institution-cleanup/{institutionId}` | Runs it. Requires `confirmation` equal to the institution's `title`. |
| GET | `/api/institution-cleanup/history` | Last 50 runs, **all institutions**. |

### Groups

`assessments`, `lessons`, `attendance`, `assignments`, `admissions`, `finance`, `hris`, `devices`,
`communications`, `tala`, `structure`, `roles` — 98 tables in total.

Catalog order **is** the delete order and is not optional. `structure` is last because sections,
subjects and grading scales are what most of the earlier groups are scoped *through*; deleting a
subject first would leave its grades unreachable by the query meant to take them. Whatever order a
client sends, `normalizeGroups()` puts the run back into catalog order.

## Three things that are easy to get wrong

### 1. Scoping — this is where a cross-tenant leak would come from

Most tables carry `institution_id`. Many do not, and for those the wrong narrowing is not a bug that
shows up in tests, it is another school's data. A student may be enrolled at two institutions on the
platform (`unique_active_institution_per_student` allows one *active* enrolment plus an inactive one
— a transfer whose old school still holds their records).

So every table without its own `institution_id` is scoped **through a parent that has one**, and
`applyInstitutionScope()` recurses: `student_assessment_answers` → attempt → ECR item → ECR →
`subjects.institution_id`, four hops, four nested `whereIn`s.

The single exception is **`core_value_markings`**, which carries only `student_id` and
`academic_year` and has no route to an institution at all. It is scoped through
`student_institutions` instead, and is called out on screen for that reason. If you add a table with
no `institution_id`, add a `scoping()` entry with it — do not let it fall through to the direct
`institution_id` branch.

### 2. Delete order — the database will not stop you

Almost every foreign key involved is `CASCADE` or `SET NULL`. A wrong order mostly would not *fail*;
it would quietly succeed and take something with it. The one hard stop in the schema is
`student_assessment_answers.question_id`, which is `RESTRICT` — answers must be deleted before the
questions they answer.

Order dependencies worth knowing: `payslip_deductions` → `staff_loan_installments` → `payslips`;
`subjects` → `class_sections` → `strands` → `tracks`. Deleting `departments` nulls
`institutions.default_department_id` (SET NULL), which is expected.

### 3. Roles — the one blocker

`roles` is opt-in and **refuses** while any staff member is still attached to a school-built role.
`user_institutions.role_id` is SET NULL, so the delete would succeed and a school full of teachers
would sign in the next morning with a login and no permissions — breaking the exact promise the
feature exists to keep. `extraConditions()` also restricts the group to `is_system = 0`, so the
platform's shared system roles are never in scope.

The fix the blocker names is real: move those people to a system role, then run it again.

## Why the super-administrator check is written out in the controller

Every route is behind `module:institution-cleanup,manage`, and the module is `system_only` so no
school can hand it out in its own role builder. That is already the two gates the rest of the app
relies on, and it is deliberately **not** enough here: `system_only` governs what the role builder
*offers*, not what a stray `role_permissions` row can grant. Every other `system_only` screen that
leaked would show someone a list. This one would let them empty a live school.

So `refuseUnlessSuperAdministrator()` runs on all four endpoints, checking the role slug — identity,
not a permission string. There is no permission that grants this.

## Integration

**This module reads the whole schema and writes only its own log.** It has no service other modules
call, and nothing depends on it at runtime. The dependency runs the other way, and it is a
maintenance one:

- **Any module that adds a table** must add it to `InstitutionCleanupGroups`, or a clean-up will
  silently leave its rows behind — a school that was emptied still carrying data. The check that
  catches this is the count in `InstitutionCleanupTest`; there is no automatic schema diff.
- **Any module that adds an upload** must add its column to `InstitutionDataCleaner::FILE_COLUMNS`
  or the R2 objects are orphaned when the rows go. Currently: `payment_receipt_submissions.file_path`,
  `announcement_attachments.file_path`, `disbursement_receipts.path`. Student documents and profile
  pictures are deliberately absent — they belong to the student, who survives.
- **[Finance Data Clearing](../Finance/FINANCE.md)** is the narrower sibling: same three-step shape,
  scoped to one academic year, run by the *school* under `finance.clear-data`. Its
  `finance_data_clear_logs` rows survive a clean-up.

Consumers of the data this deletes are, in effect, every module in the app. After a successful run
the frontend calls `queryClient.clear()` rather than naming query keys, because anything still on
screen is describing records that no longer exist.

## Not yet wired

- **No dry-run export.** The preview reports counts, not the rows themselves. There is no
  "download what you are about to delete" step; the backup is the operator's job.
- **`realtime_attendance` is deliberately excluded.** It carries no institution column at all — only
  a device serial and a person name — so there is no safe way to narrow it to one tenant. Its rows
  survive a clean-up. If that table gains an `institution_id`, add it to the `devices` group.
- **Nothing is queued.** The run is synchronous inside one transaction. It is fine at the sizes
  seen so far (a few hundred thousand rows), but a very large tenant would hold a long transaction
  and could hit the request timeout. If that happens, move it to a job rather than splitting the
  transaction — a partial clean-up is worse than a slow one.
- **No scheduled or API-triggered cleanup.** By design: this is a screen a person stands in front
  of, types a school's name into, and watches.
