# MATATAG Key Stage 1 — Competency Progress Reporting

> **Status: designed, not built.** Nothing in this document is wired yet. It records the verified
> analysis of DepEd's official instrument and the decisions taken, so that the first
> implementation — and every DepEd revision after it — starts from fact rather than from reading
> the spreadsheet again. Everything under [File map](#file-map) is **planned**; treat a path there
> as a destination, not a claim that it exists.
>
> Source of truth for the design: [`KEY_STAGE_1_GRADE_1_3_TERM.xlsx`](KEY_STAGE_1_GRADE_1_3_TERM.xlsx),
> committed beside this doc. DepEd's official instrument, marked `2026_v1.0`, analysed 2026-09-08.
> It is kept in the repo deliberately: every figure below is reproducible from it, and each future
> DepEd release should be committed the same way so a revision can be diffed against its predecessor.

DepEd's MATATAG rollout replaces numeric quarterly grading for **Key Stage 1 (Grades 1–3)** with a
term-based, competency-level, descriptor-only record. This module implements that **alongside** the
existing numeric grading, which it must never alter: a K-12 school runs both at once.

| | Existing numeric grading | This module |
|---|---|---|
| Periods | 4 quarters | **3 terms** |
| Unit of assessment | subject × quarter | **learning-competency slot × term** |
| Value | numeric score → transmuted grade | **letter descriptor A–E** |
| Aggregation | weighted, averaged, transmuted | **none at all** |
| Report card | numeric SF9 | narrative progress report + attached PACE forms |
| Record owner | the subject teacher | **the adviser**, for all learning areas |

---

## Read this first: two things that will bite you

### 1. `App\Support\GradingPeriods` cannot be reused, however much it looks like it can

The platform already models 3-terms-vs-4-quarters:
`institution_academic_years.grading_period_type enum('quarter','term')`, `COUNTS = [quarter => 4,
term => 3]`, `GET /api/grading-periods`, 22 backend consumers and 26 frontend files. Switching a
school to `'term'` looks like it hands you this module's period structure for free.

It does not. `GradingPeriods::forInstitution($institutionId, $academicYear)` resolves the structure
per **(institution, academic year)** — school-wide for the year — and `institution_academic_years`
is `UNIQUE (institution_id, year)` with no grade-level dimension to add one to. But a K-12 school
needs Grades 1–3 on 3 MATATAG terms **while Grades 4–12 stay on 4 numeric quarters in the same
year**. Flip the flag and `count()` returns 3 school-wide, `assertValidPeriod()` starts throwing
*"this academic year is divided into 3 terms, so term 4 does not exist"* at every Grade 10 teacher
entering Q4, and on the frontend `ClassSectionCoreValuesTab.tsx` silently resets the period filter
to `'1'` when `'4'` disappears.

**This module therefore owns its own fixed 3-term concept (`App\Support\MatatagTerms`) and never
calls `GradingPeriods`.** A regression test pins the premise. Related: `student_running_grades.quarter`
is a hard `enum('1','2','3','4')` with a `decimal(5,2)` value, so descriptors could not live there
even if the period model matched.

### 2. The DepEd workbook is Grade 1 only — and it invites you to think otherwise

Every content sheet is Grade 1: `SF9 - GRADE 1`, `PACE - GRADE 1`, `G1 PACE FORM MAKABANSA`,
`G1 - ATTENDANCE SUMMARY`. There are no Grade 2 or Grade 3 competencies anywhere in the file.

But `INPUT DATA!F27` (grade level) is a `dataValidation` list of `"1,2,3"`. A school can set the
workbook to Grade 2 and the report-card header will read Grade 2 **while every PACE form still
prints Grade 1's competencies.** Nothing in the file prevents it.

So: **never infer a catalog from a grade-level string.** Section opt-in must reject a curriculum
version whose `grade_level` does not match the section's, and every rating row carries a
denormalised `curriculum_version_id` so a reprint years later resolves the exact catalog the mark
was made against.

---

## Receiving a DepEd update

**Assume this is a continuing stream, not a one-off.** DepEd has already revised descriptor wording
once during the MATATAG rollout, Grades 2 and 3 are outstanding, and Key Stage 2 is a separate
instrument still to come. The design's whole purpose is that a new catalog is **data plus a
fifteen-line migration**, never a schema change.

### A new grade level (Grade 2, Grade 3)

1. Obtain the official workbook. **Ask early** — without it the catalog cannot be extracted.
2. Run `api/database/data/matatag/extract.py` against it. Check its report: every slot must resolve
   to a macro skill or to `none`, with **zero unmatched**. If the palette changed, add the new ARGB
   values to `config/matatag.php` (see [the palette](#the-macro-skill-palette)) and re-run — this is
   a config change, not a code change.
3. Review the emitted `grade-N.v1.json`, especially its `counts` block, against a hand count off the
   PACE sheets. The loader asserts these; a mismatch rolls the whole load back.
4. Commit the JSON beside the others. Add a data migration calling
   `CatalogLoader::load(database_path('data/matatag/grade-N.v1.json'), setDefault: true)`.
5. `php artisan matatag:load-catalog` loads it into a running environment without a deploy.

**No code changes.** What varies between grade levels, and what absorbs it:

| Variation | Absorbed by | Code change? |
|---|---|---|
| Different competencies, numbering, nesting | `matatag_competencies` rows | none |
| Different **learning areas** entirely (English/Filipino split, Araling Panlipunan) | `matatag_learning_areas` rows | none |
| Domains where Grade 1 had none, or none where it had six | `matatag_domains` + `has_domains` | none |
| An area's list spanning the year vs restarting each term | `shape` column — **varchar, not enum**, deliberately | none |
| A new macro skill, or an area using none | `macro_skill` varchar + config | config only |
| Different slot counts, different term pacing | `matatag_competency_slots` rows | none |
| Different descriptor wording | `config/matatag.php` | config only |
| A **new per-competency text field** | `matatag_competencies.extra` (json) | none |

Nothing in code may hardcode Grade 1's shape. In particular **199 and 604 are not constants** — the
loader asserts each file's *own* per-area counts, so each grade level asserts its own totals. The
entry grid renders whatever `columns` the API returns and branches only on the
`uses_macro_skills` / `has_domains` / `carries_values` flags — never on an area key or a grade level.

### A revision to a grade level already in use (v1.0 → v1.1)

**A revision is a new version row, never an edit.** Load it as `grade-1.v2.json` with a new `code`.
Descriptors already recorded cannot move, guaranteed at four levels:

1. `matatag_competency_ratings.slot_id` is `ON DELETE RESTRICT` — a database-level pin that does not
   depend on application code being correct.
2. The loader's natural keys (`UNIQUE (learning_area_id, path)`,
   `UNIQUE (competency_id, term, macro_skill)`) are **scoped to one `curriculum_version_id`**, so it
   never issues an UPDATE or DELETE against another version's rows.
3. `matatag_curriculum_versions.locked_at` is stamped on the first rating written against a version.
   The loader refuses a locked version, so *"just fix a typo in v1.0"* fails loudly instead of
   rewriting history under live marks. `--force` exists and prints the affected rating count first.
4. A section is pinned to its version **for the whole academic year**, so flipping the
   `matatag_grade_level_curricula` default is invisible to any section already mid-year.

**Rolling a live section from v1.0 to v1.1 mid-year is deliberately not supported.** Whether a
revised competency changed *meaning* or only *wording* is a per-competency judgement; no generic
migration is correct. Sections opting in after the flip get the new version; existing ones finish
the year on the old one.

### The macro-skill palette

The workbook encodes each slot's language macro skill **only as the cell's fill colour**, with a
legend but no machine-readable label. Verified against `TERM 1 READING & LITERACY` P10/W10/AD10/AK10
and `PACE - GRADE 1` L75:O77:

| ARGB | Macro skill |
|---|---|
| `FFFDE49A`, `FFFFE598` | Listening |
| `FFC9A6E6` | Speaking |
| `FFFFA766`, `FFF7B083` | Reading |
| `FFC4E0B3` | Copying and Guided Writing in response to Comprehension Questions |
| `FF000000`, theme fills | **not taught this term — no slot exists** |

This table lives in `config/matatag.php` next to the labels precisely so the next extraction is
reproducible. If a future workbook uses different shades, add them there.

---

## The data model

### A slot is (competency × macro skill × term)

This is the load-bearing definition, and it was **proven rather than inferred**. A slot exists in a
term **iff its cell carries a macro-skill fill in that term's class-summary sheet**, and the
competency it belongs to is named by rows 12 and 13 directly above the cell. Two independent signals
were compared:

| Sheet | Macro-skill-filled cells | Cells referenced by `PACE` formulas | Agreement |
|---|---|---|---|
| T1 Reading & Literacy | 74 | 74 | exact |
| T2 Reading & Literacy | 76 | 76 | exact |
| T3 Reading & Literacy | 91 | 93 | 2 extra |

74 + 76 + 91 = 241, matching the extracted slot count exactly. The only disagreement is columns `S`
and `T` in T3 — which are the `PACE!I109`/`I110` cells listed below as a formula bug in DepEd's file.
Two independent readings agree everywhere except on a known defect.

**Consequence: "blocked" is not a slot property.** A slot simply has no row for a term it is not
taught in. Our grid renders only the term's real slots.

### Read each term's sheet on its own. Never carry a column number between them.

This is the single most important rule for extracting a MATATAG workbook, and getting it wrong is
almost invisible.

The tempting approach is to take the columns a competency's PACE formulas point at and look those
column numbers up in each term's sheet. That assumes the three term sheets share one column layout.
**They do not.** `TERM 3 LANGUAGE` is two columns wider than its Term 1 and Term 2 siblings, because
DepEd inserted an extra child pair under competency 6; every column after it is shifted by two, so a
Term-1 column number read against the Term-3 sheet lands on a neighbour's cell.

What makes this dangerous is that it nearly works. Wherever both children of a competency are
assessed in Term 3, the shifted read lands on another filled cell and the per-term **totals still
come out right** — so a count-based check passes while the attribution is wrong. In Grade 1 it cost
exactly one pair: Language competency 8 is assessed on child **b** in Term 3 and on child **a** in
Terms 1 and 2, and the shifted read credited Term 3 to child a. A teacher would have been asked to
mark the wrong competency, and the PACE form would have printed it under the wrong heading.

So the extractor reads each sheet entirely on its own: the fill says whether a slot exists and which
macro skill it is, and rows 12/13 say whose it is. Nothing is carried between sheets, so a layout
that shifts cannot misattribute anything. The PACE form is used only for the competency tree and its
wording. `MatatagCatalogLoadTest::test_the_term_3_language_column_shift_is_attributed_correctly`
pins competency 8 by name. **Assume the next grade level's workbook has the same class of defect.**

Two quirks of how DepEd fills those heading rows, both handled:

- Row 13 is written only on the **first** column of a child's pair — the *Speaking* column beside it
  is left blank — so a blank inherits the letter to its left.
- A competency with no lettered children **repeats its own number** on row 13 rather than leaving it
  empty. That means "no child", not "child 19".

### Two shapes, both required

1. **Reading & Literacy, Language** (`shape = year_list`) — one competency list for the whole year;
   each competency rated in *some subset* of the terms (curriculum pacing); 1–4 slots per competency,
   one per macro skill.
2. **Mathematics, GMRC, Makabansa** (`shape = per_term_list`) — a **separate competency list per
   term**, numbering restarting at 1 each term, exactly one slot per competency, no macro skill.

Competencies nest **exactly one level**: a numbered parent may have lettered children (`a`, `b`)
which hold the slots, the parent then holding none.

### Grade 1 catalog, as extracted

| Learning area | Source sheets | Domains | Competencies | Slots |
|---|---|---|---|---|
| Reading & Literacy | `TERM {1,2,3} READING & LITERACY` | 6, span the year | 42 | 241 |
| Language | `TERM {1,2,3} LANGUAGE` | 4, span the year | 64 | 273 |
| Mathematics | `TERM 1-3 MATHEMATICS` | 3 distinct, **2 per term** | 54 | 52 |
| GMRC | `TERM 1-3 GMRC` | none | 24 | 24 |
| Makabansa | `G1 PACE FORM MAKABANSA` | none | 15 | 14 |
| **Total** | | | **199** | **604** |

Mathematics domains are two per term drawn from three across the year — T1 *Number and Algebra* +
*Measurement and Geometry*; T2 *Number and Algebra* + *Data and Probability*; T3 *Number and Algebra*
+ *Measurement and Geometry*. Do not assume three per term.

GMRC alone carries an extra text field per competency: a Filipino `Performance Standard` sentence
beside the value it cultivates, which is the competency's own wording.

### Descriptors

Verbatim from `SF9 - GRADE 1` L46:R61. Wording is owned by `config/matatag.php` and served to
clients, never duplicated in a frontend constant.

| | Descriptor | Filipino |
|---|---|---|
| **A** | Advancing | Namumukod-tangi |
| **B** | Benchmarking | Naipamamalas |
| **C** | Connecting | Natutungo |
| **D** | Developing | Nagpapaunlad |
| **E** | Emerging | Nagsisimula |

There is **no averaging, no transmutation and no general average** anywhere in the instrument. A
learner's record is a set of descriptors plus two free-text narratives per term. The progress-report
payload is shaped to enforce this, and a test asserts no key matching
`/average|final_grade|transmuted|grade$/` appears in the response.

### Tables

**Global catalog** — shared by all tenants, version-pinned, never touched by an institution
clean-up:

| Table | Purpose | Key index |
|---|---|---|
| `matatag_curriculum_versions` | one published catalog | `UNIQUE (code)`; `locked_at`, `competency_count`, `slot_count` |
| `matatag_grade_level_curricula` | the default version per grade level | `grade_level` as **PK** — one default, structurally |
| `matatag_learning_areas` | the areas | `UNIQUE (version_id, key)` |
| `matatag_domains` | domains; `term = 0` when year-spanning | `UNIQUE (area_id, term, code)` |
| `matatag_competencies` | the competency rows, one level of `parent_id` | `UNIQUE (area_id, path)`, e.g. `T1.9.a` |
| `matatag_competency_slots` | the rateable cells (604 for Grade 1) | `UNIQUE (competency_id, term, macro_skill)` |

**Per-tenant:**

| Table | Purpose | Key index |
|---|---|---|
| `matatag_section_curricula` | opt-in + **version pin** + `grade_level` snapshot | `UNIQUE (class_section_id, academic_year)` |
| `matatag_competency_ratings` | the descriptors | `UNIQUE (student_id, academic_year, slot_id)` |
| `matatag_term_narratives` | the two per-term paragraphs | `UNIQUE (student_id, academic_year, term)` |

Four schema decisions that each prevent a specific bug, and which a future change must not undo:

- **`term` defaults to `0` and `macro_skill` to `'none'` — never NULL.** MySQL permits unlimited
  NULLs in a unique index, so a nullable `macro_skill` would not stop a second catalog load doubling
  GMRC's 24 slots to 48. This is the likeliest seed bug in the module; the index is what makes it
  impossible.
- **`path` is the competency natural key**, not `(term, number, letter)` — `letter` is NULL on every
  parent and `number` is NULL on some children, so that tuple would not constrain. `path` is also
  the stable identifier to quote when DepEd revises wording.
- **`academic_year` is in the ratings unique key**, because a retained Grade 1 learner re-sits the
  same slots next year; `(student_id, slot_id)` alone would overwrite last year's record.
- **`descriptor` is `char(1)` validated from config, not a MySQL enum.** `core_value_markings.marking
  enum('AO','SO','RO','NO')` is the same mistake made in a newer table and needs an `ALTER TABLE`
  the day a descriptor is renamed — which has already happened once.

**Every per-tenant table carries `institution_id` directly.** This is deliberate:
`InstitutionCleanupGroups` records that `core_value_markings` is the one table it cannot scope
through a parent, so cleaning School A deletes a dual-enrolled learner's School B markings. None of
these tables needs a `scoping()` entry.

---

## Attendance: a documented deviation from the DepEd form

DepEd's attendance table prints **September twice** — once under Term 1, once under Term 2 — because
their term boundary falls mid-month (`SF9 - GRADE 1` rows 25–36; `G1 - ATTENDANCE SUMMARY` row 11
has two adjacent `SEP` columns).

**We print September once, wholly inside Term 1.** Terms map to whole months: T1 = Jun–Sep,
T2 = Oct–Dec, T3 = Jan–Apr, giving 11 month rows.

**Why:** `student_attendances` stores one row per (student, section, academic_year, month, year) and
there is **no daily academic-attendance table anywhere in the schema** (`realtime_attendance` is a
name-matched biometric gate feed, not a register). A monthly figure cannot be apportioned without
dated data, and pro-rating it by calendar weekdays would print a confident number that nobody at the
school could reproduce or defend to a parent — `school_days.total_days` is hand-entered precisely
because holidays and suspensions vary per school.

Consequences for anyone touching the derivation:

- It reads `student_attendances` and `school_days` **verbatim and writes nothing.**
- `student_attendances` has **no unique index** — its migration declares none, and
  `StudentAttendanceController::bulkUpsert` dedupes by hand. The derivation must therefore
  `groupBy(month, year)` and **sum**, emitting a warning naming any duplicate. A printed DepEd
  attendance total that silently double-counts is a real hazard.
- `school_days` is **per-department** (added later, by
  `2026_03_09_000004_add_department_id_to_school_days_table.php`), so take `department_id` from
  `class_sections.department_id` with the institution default as fallback.

If a school insists on the 13-row form, the honest fix is a per-learner September split entered once
per section-year, validated to sum to the monthly figure. That is **not** built.

---

## Defects in DepEd's workbook — model correctly, do not reproduce

Confirmed by reading the cells. Fix in our data; note the deviation.

| Cell | Defect |
|---|---|
| `SF9!Q27` | August's days-present reuses VLOOKUP index `6`, same as July's `Q26` — August prints July's figure. Indices run 4, 6, 6, 7 where they should run 4, 5, 6, 7. |
| `PACE!I109`, `I110` | Read `'TERM 3 READING & LITERACY'` for a **Language** competency. |
| `PACE!R112` | Reads `'TERM 2 LANGUAGE'` where Term 3 is meant. |
| `PACE!R141` | Reads `'TERM 1 LANGUAGE'` where Term 3 is meant. |
| `TERM 1-3 MATHEMATICS` T2 | Numbers the children of competency `3` ("Determine:") as top-level `3`, `4`, `5` — inconsistent with every other nested competency in the file. |
| `TERM 1-3 GMRC` T3 | Competency `3` (*Mapagmalasakit*) repeats competency `4`'s (*Mapagbigay*) performance standard verbatim. |
| `TERM 3 LANGUAGE` column layout | The sheet is **two columns wider** than its Term 1 and Term 2 siblings: an extra child pair was inserted under competency `6`, shifting every column after it. Any extraction that reuses one term's column numbers on another term's sheet misattributes slots from competency 6 onwards — see "Read each term's sheet on its own" above. |
| `TERM 3 LANGUAGE` `AS`/`AT` | The inserted pair carries a **copied heading**: two adjacent pairs are both labelled competency `6b`. It is a duplicated column, not a second assessment; the extractor reports it and drops it. Dropping it is why Term 3 Language holds 95 slots and not the 97 cells that are filled. |

Extracting from macro-skill fills rather than PACE formulas removes the four formula bugs
automatically, and reading each sheet's own headings removes the Term 3 Language shift. The Math
numbering, the GMRC duplicate and the duplicated `6b` column need a judgement call, and each one is
printed in the extractor's `anomalies` report. **A silent extraction run is not a successful one.**

---

## File map

Rows marked *planned* do not exist yet. Everything else is built and tested.

### API

| Path | Purpose | |
|---|---|---|
| `api/config/matatag.php` | terms + months, the five descriptors, macro-skill labels **and their ARGB fills**, Key Stage 1 grade levels | |
| `api/app/Support/MatatagTerms.php` | the reader; shaped like `GradingPeriods`, deliberately never calling it | |
| `api/app/Support/AcademicYear.php` | `forSection()` beside the existing `forSubject()` / `forInstitution()` | |
| `api/database/migrations/2026_09_14_00000{1..4}_*` | catalog tables, section curricula, ratings, narratives | |
| `api/database/migrations/..._000005_grant_matatag_grading_permission.php` | permission backfill for existing tenants' roles | |
| `api/database/migrations/..._000006_load_matatag_ks1_grade_1_catalog.php` | data migration invoking the loader; `down()` refuses while ratings or pins exist | |
| `api/database/data/matatag/extract.py` | the workbook extractor, committed **beside the data** | |
| `api/database/data/matatag/README.md` | the ARGB table and the extraction runbook | |
| `api/database/data/matatag/grade-1.v1.json` | the catalog artifact | |
| `api/app/Services/Matatag/CatalogLoader.php` | idempotent loader; asserts the JSON's own counts | |
| `api/app/Services/Matatag/CatalogLoadResult.php`, `CatalogLoadException.php` | what a load did; why one was refused | |
| `api/app/Console/Commands/LoadMatatagCatalog.php` | `matatag:load-catalog {file} {--default} {--force} {--dry-run}` | |
| `api/app/Models/Matatag*.php` | nine models, `HasUuids`, no `SoftDeletes` | |
| `api/tests/Feature/MatatagCatalogLoadTest.php` | the real artifact's counts, idempotency, and the versioning promise | |
| `api/app/Services/Matatag/TermAttendance.php` | derivation; reads only | *planned* |
| `api/app/Http/Controllers/Matatag*Controller.php` | reference, section, rating, narrative, attendance, progress-report | *planned* |

Routes — *planned* — in `api/routes/api.php`, near the Proficiency / Core Value Marking block.
**Every route carries both gates** — `feature:matatag-grading` and `module:matatag-grading,<ability>`.
`EnsureFeatureEnabled` deliberately does not honour the super-administrator wildcard, so nobody
reaches this at a school that has not been switched on.

| Route | Ability |
|---|---|
| `GET matatag/reference` | `view` |
| `GET matatag/curriculum` | `view` |
| `GET matatag/sections` | `view` |
| `POST/DELETE matatag/sections/{id}/opt-in` | `set-up` |
| `GET matatag/grid` | `view` |
| `POST matatag/grid/bulk-upsert` | `manage` |
| `GET matatag/narratives`, `POST matatag/narratives/bulk-upsert` | `view` / `manage` |
| `GET matatag/attendance` | `view` |
| `GET matatag/progress-report[/{studentId}]` | `view` |

`set-up` is separate from `manage` on purpose: deciding how a whole year is reported is not the same
act as recording one learner's descriptor, and a school must be able to grant the second without the
first.

### Frontend — *all planned*

| Path | Purpose |
|---|---|
| `app/src/pages/MyClassSections/components/Ks1*.tsx` | the entry grid, narratives, attendance, reports — a **tab in the adviser's class-section workspace** |
| `app/src/hooks/useKs1*.ts`, `app/src/services/ks1*Service.ts` | per the mandated `pages → hooks → services → lib/api.ts` layering |
| `app/src/types/index.ts` | all types in the barrel — the `@react-pdf` components need them, and importing from a service would be a back-edge |
| `app/src/components/ks1ProgressReportCard/`, `ks1PaceForm/` | `@react-pdf/renderer` documents |

### Registration checklist for the new module

`api/config/modules.php` (`academics` group) · `api/config/features.php`
(`default_enabled => false` during rollout) · `api/app/Support/SystemRolePermissions.php` (the
`subject-teacher` MANAGE entry is load-bearing — a Grade 1 adviser is a `subject-teacher`-slugged
user, and without it they cannot open their own grid) · the grant-permission backfill migration ·
`api/app/Support/InstitutionCleanupGroups.php` (a **separate** `matatag` group, placed before
`structure`) · `app/src/App.tsx` and `Sidebar.tsx` if a top-level surface is ever added.

---

## Integration

**This module deliberately consumes very little and is consumed by nothing.**

Reads, without writing:

| Source | Used for |
|---|---|
| `class_sections` | the section, its `grade_level`, `adviser` and `department_id` |
| `student_sections` | the roster — **directly**, not via `App\Support\SubjectRoster`, which resolves a *subject's* roster; the five learning areas are not `subjects` rows |
| `students` | names, LRN, sex, birthdate (ages at start and end of year) |
| `student_attendances`, `school_days` | the derived attendance table |
| `institutions` | report-card letterhead |

Writes: only its own `matatag_*` tables.

**Consumers: none yet.** Nothing else in the platform reads MATATAG descriptors. If that changes,
add the consumer here so a schema change knows what it will break.

**A hard boundary worth enforcing in review:** this module must never import
`studentRunningGradeService`, `consolidatedGradesService`, `RunningGradeRecalcService`,
`ParentSubjectGradeService`, or `GradingPeriods`. There is nothing numeric to reconcile — no average,
no transmutation, no general average — and any code reaching for those is misunderstanding the
instrument.

---

## Not yet wired

- **Every HTTP route, and the whole frontend.** The catalog, its nine tables and the loader are
  built and tested; nothing reads them over the wire yet. `docs/modules/README.md` conventions say
  an Integration section lists live consumers — there are none.
- **`TermAttendance`.** The derivation from `student_attendances` / `school_days` is designed above
  and not written.
- **Grades 2 and 3.** No catalog exists. Their workbooks have not been obtained, and their structure
  may differ from Grade 1's in which learning areas exist, whether an area has domains, and whether
  its list spans the year or restarts each term.
- **Key Stage 2 (Grades 4–6).** A different key stage with a different instrument. Explicitly out of
  scope; do not stretch this design to cover it on the assumption it looks similar.
- **The official `.xlsx` export.** Verified that `xlsx@0.18.5`, the community build bundled in
  `app/`, **silently drops cell fills and fonts on write** — a round-trip returns
  `patternType: 'none'`. Since the entire macro-skill encoding *is* fill colour, and `PACE - GRADE 1`
  / `SF9 - GRADE 1` are **formula sheets** computing from the class-summary sheets, a client-side
  rebuild loses exactly what makes the form legible. The workable path is server-side template
  filling: commit a pristine copy of the workbook, `IOFactory::load()` it with
  `phpoffice/phpspreadsheet`, write only the class-summary value cells and `INPUT DATA`, and stream
  it back — every fill, merge, print area and formula already correct, with PACE and SF9 populating
  themselves. That would be the repo's first server-side spreadsheet and is **not decided**.
- **A mid-month term boundary for attendance** — see the deviation above.
- **Mid-year migration of a live section between catalog versions** — deliberately unsupported.
- **A narrative length cap.** Unbounded text in a fixed DepEd box has no correct rendering; a cap
  (~600 chars/field) needs sign-off from whoever owns the DepEd relationship.
