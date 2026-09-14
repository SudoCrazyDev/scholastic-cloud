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
| `api/database/data/matatag/grade-1.v1.cells.json` | where each of the 604 slots lives on DepEd's sheet; generated by the same run | |
| `api/app/Services/Matatag/CatalogLoader.php` | idempotent loader; asserts the JSON's own counts | |
| `api/app/Services/Matatag/CatalogLoadResult.php`, `CatalogLoadException.php` | what a load did; why one was refused | |
| `api/app/Console/Commands/LoadMatatagCatalog.php` | `matatag:load-catalog {file} {--default} {--force} {--dry-run}` | |
| `api/app/Models/Matatag*.php` | nine models, `HasUuids`, no `SoftDeletes` | |
| `api/tests/Feature/MatatagCatalogLoadTest.php` | the real artifact's counts, idempotency, and the versioning promise | |
| `api/app/Services/Matatag/TermAttendance.php` | derivation from `student_attendances` / `school_days`; reads only | |
| `api/app/Services/Matatag/CurriculumTree.php` | the tree, and one (area, term) block of grid columns | |
| `api/app/Http/Controllers/Concerns/ResolvesMatatagSection.php` | **the single place every cross-tenant guard lives** | |
| `api/app/Http/Controllers/Matatag{Reference,Curriculum,Section,Grid,Narrative,Attendance}Controller.php` | the six controllers | |
| `api/tests/Feature/Matatag/*` | opt-in, grid, narratives, attendance, access — sharing a two-school fixture | |
| `api/app/Services/Matatag/ProgressReport.php` | composes the card and the forms; the one place the payload's shape is decided | |
| `api/app/Http/Controllers/MatatagProgressReportController.php` | the report-card + PACE payload, section-wide or one learner | |
| `api/app/Services/Matatag/WorkbookExport.php` | fills DepEd's own .xlsx from the committed template | |
| `api/app/Http/Controllers/MatatagWorkbookController.php` | streams it; raises the memory limit for that one request | |
| `api/resources/matatag/KEY_STAGE_1_GRADE_1_3_TERM.template.xlsx` | the template the export fills — trimmed, see its README | |
| `api/resources/matatag/README.md` | what was trimmed from DepEd's file and why, and the runbook for a new one | |
| `api/tests/Feature/Matatag/MatatagWorkbookExportTest.php` | reads the export back cell by cell, in both directions | |

Routes in `api/routes/api.php`, near the Proficiency / Core Value Marking block.
**`feature:matatag-grading` wraps the whole group** rather than being repeated per route, so a route
added later cannot quietly miss it. Each route then names its own ability. — `feature:matatag-grading` and `module:matatag-grading,<ability>`.
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
| `GET matatag/workbook` | `view` |

`set-up` is separate from `manage` on purpose: deciding how a whole year is reported is not the same
act as recording one learner's descriptor, and a school must be able to grant the second without the
first. Printing, by contrast, is `view` on both report routes: a curriculum head who may not mark a
learner may still print the card.

#### The progress-report payload

The shape *is* the model. The body of the card is `narratives` + `attendance` + `legend`; the
descriptor grid is **not on the card** — DepEd prints it on the attached PACE forms — so it lives
under `pace` and nowhere else. There is no key anywhere in the response for an average, a final
grade, a score, a weight or a transmutation, not even as null: a field that exists eventually gets
filled in. `MatatagProgressReportTest` walks the whole nested response asserting that, rather than
trusting the composer to have been written carefully.

**The catalog is hoisted.** Competency text is the bulk of the payload and is identical for every
learner, so it is emitted once under `pace.learning_areas` and each learner carries only a flat
`slot_id => descriptor` map.

**Three PACE scopes, and the caller is told which it got.** A whole section across all five areas is
50 × 604 descriptors and ~600 printed pages, and it is the one combination nobody should reach by
accident. Naming a learner gives `all_areas`; naming a learning area gives `one_area` for the whole
class; naming neither gives `omitted` — the report cards without the forms, plus a `note` saying so.

**Descriptors are scoped by institution and year, not by class section.** A child who moves between
two Grade 1 sections in October must not have Term 1 missing from their own card — the marks are the
learner's. But the `institution_id` filter stays, because a transferred-in child leaves a term of
descriptors behind at the school they came from and those must not print on this one's form.

**Ages are computed from the school year's own month rows**, never from `now()`. `config/app.php`
hardcodes UTC while the schools are in Asia/Manila; a learner's printed age is not something to be
eight hours wrong about.

### Frontend

| Path | Purpose | |
|---|---|---|
| `app/src/pages/MyClassSections/components/MatatagTab.tsx` | the workspace: opt-in, area/term selectors, the three panels | |
| `app/src/pages/MyClassSections/components/MatatagGrid.tsx` | the entry grid — roving single editor, type-to-set, `Ctrl+D` | |
| `app/src/pages/MyClassSections/components/MatatagNarrativesPanel.tsx` | the two paragraphs, capped with a live counter | |
| `app/src/pages/MyClassSections/components/MatatagAttendancePanel.tsx` | the derived table, read-only | |
| `app/src/hooks/useMatatag.ts`, `app/src/services/matatagService.ts` | per the mandated `pages → hooks → services → lib/api.ts` layering | |
| `app/src/pages/MyClassSections/ClassSectionDetail.tsx` | a ninth tab, shown only on a Key Stage 1 section | |
| `app/src/pages/MyClassSections/components/MatatagReportsPanel.tsx` | the printing panel: preview one learner, download by learner or by area | |
| `app/src/components/matatagReports/Ks1ProgressReportCard.tsx` | the card — A4 portrait, `@react-pdf/renderer` | |
| `app/src/components/matatagReports/Ks1PaceForm.tsx` | the PACE forms — A4 portrait, two columns, hand-paginated | |
| `app/src/components/matatagReports/matatagPdfShared.ts` | page geometry and the helpers both documents share | |
| `app/src/hooks/useMatatagReports.tsx` | the report query and the five download mutations | |
| `app/src/utils/reportCardPdfUtils.ts` | gains `fitPdfBlockFontSizePx` / `estimatePdfBlockHeightPt` | |
| `app/src/services/matatagService.ts` | `getWorkbook()` — and it decodes an errored blob back into the API's message | |

Two things about the grid are worth knowing before touching it.

**Exactly one cell renders a `Select`.** The cell *count* is not the problem — 4,550 `<td>`s is about
5,000 nodes, and `SectionGrades` already puts four nested divs in every cell. 4,550 Headless UI
`Select`s would be. So the active cell is a real `Select` and the other 4,549 are text, which
honours the repo's Select mandate for the editor itself. A windowed grid cannot work here: it
cannot be a real `<table>`, and the three-tier header is built from `colSpan`.

**`Ctrl+D` must be tested before the letter branch.** `D` is one of DepEd's five descriptors, so a
handler that checks "is this a descriptor letter" first swallows `Ctrl+D` and marks one cell `D`
instead of filling the column. This was a real bug, caught only in a browser.

### The two printed documents

**The card is portrait; the numeric SF9 is landscape.** What this card is made of is prose — two
paragraphs per term, three terms — and landscape gives those a short wide box a teacher's sentence
hits the bottom of. One learner is one A4 sheet: narratives down the left, attendance, the A-E
legend and the two certificates down the right.

**Narrative overflow has three defences, in order.** A cap at entry (600 characters, with a live
counter); then `fitPdfBlockFontSizePx` shrinking the text to fit, down to a **6pt legibility floor**
rather than to nothing; then a continuation page for whatever still will not fit. The floor is the
point: shrinking a parent's report card to 4pt to avoid a page break is the wrong trade, so it is
not made. The third defence exists because narratives written before the cap, or pasted past it, are
real.

**Do not reuse `ACADEMIC_YEAR_MONTHS` / `ATTENDANCE_MONTH_LABELS`** from
`studentReportCard.tsx`. They are ten months keyed *by month number*, which cannot represent this
table's eleven rows, and using them would quietly erase the one place this instrument differs from
DepEd's printed form. The months, their order and their labels all come from the payload; so does
the legend wording, so a DepEd rewording stays a config change.

#### The PACE form reproduces the sheet's own layout

Read off `PACE - GRADE 1` rather than from a screenshot, because the structure is not obvious:

- **Two columns on A4 portrait, reading down the left then down the right.** `C14:R14` bands the
  learning area across both; each column then carries its own `No. | Learning Competencies | Rating
  (T1 T2 T3)` heading and its own domain bands. `C18:I18` and `K18:R18` hold *different* domains on
  the same sheet row — which is what proves the two columns are one continuous flow and not a list
  split down the middle.
- **A competency occupies one sub-row per macro skill.** Competency 1 merges `C19:C20` and `D19:F20`
  across two rating rows: Listening on `G19`, Speaking on `G20`. Competency 20a merges across three.
  So the sub-row count comes from *that competency's own slots*, never from the area's full set.
- **The colour of the square is the label.** There is no L/S/R/W column anywhere on the form, which
  is why the legend at `L74` is part of the instrument and not decoration, and why the note at `K71`
  tells the teacher to write the rating on the coloured square itself.
- **A square filled `FF3F3F3F` is a term the competency is not assessed in** — the curriculum's own
  pacing, and something a parent is entitled to see. It reads as black and costs toner; a lighter
  grey would say the same for less ink. DepEd's colour is used anyway, because on this form the fill
  of a square is the *only* thing carrying meaning and a teacher comparing a printout against the
  workbook has to be looking at the same sheet.
- The title, the LRN/Name/Section strip and the General Instructions paragraph are transcribed
  verbatim from `C4`, `C6` and `C8` (the workbook's apostrophes are mis-encoded; they are restored).

**Pagination is computed, not delegated.** react-pdf cannot flow content between columns — no
multi-column layout, no way to ask what is left on a page — so the only way to have DepEd's two
columns is to measure each block and place it. Two rules keep that safe: heights are deliberately
*over*-estimated, so the failure mode is white space at the foot of a column rather than a
competency pushed off the form; and the pages stay wrappable, so an estimate that is ever wrong
spills a row onto an extra page instead of clipping it away silently.

**The colour key sits at the foot of the first page's right column.** That is the one deliberate
departure from the sheet. DepEd's is a single scrolling worksheet that never paginates, so "at the
end" and "where you can see it" are the same place there; on a printed multi-page form they are not,
and a reader holding page one cannot decode a single square without it. For an area that fits on one
page — which is most of them — this lands exactly where the workbook puts it.

Do **not** reintroduce "reserve space on whichever page turns out to be last". It does not converge:
reserving pushes a row onto a new page, which moves where "last" is, which removes the need for the
reservation. It oscillates, and what it settles into is a page containing nothing but a colour key.

Two more things are load-bearing and easy to undo by accident:

- **Per-term-list areas band by term.** They restart their numbering at 1 each term, so "6. Magalang"
  is ambiguous between three different marks without it. After the band, the position of the one
  open square goes on saying which term it is.
- **Domain bands are keyed by position, never by title.** A domain can band more than once —
  Language has four domains but **six bands**, because its competency order leaves a domain and
  returns to it — and a title-based key collides there. React warns that duplicate keys may
  duplicate or omit children; dropping a row from a DepEd form is not a warning-level problem.
| `app/src/types/index.ts` | all types in the barrel — the `@react-pdf` components need them, and importing from a service would be a back-edge |
| `app/src/components/ks1ProgressReportCard/`, `ks1PaceForm/` | `@react-pdf/renderer` documents |

### The official `.xlsx` — DepEd's own workbook, filled in

The PDFs are what a parent is handed. This is the file a division office asks for, so it has to be
DepEd's actual workbook rather than our rendering of one.

**It is a template fill, not a build.** The macro-skill encoding on the class-summary sheets *is*
fill colour, and `PACE - GRADE 1` / `SF9 - GRADE 1` are **formula sheets** that compute themselves
from the summary sheets. So the export loads a committed copy of DepEd's file, writes only value
cells, and saves — every fill, merge, print area and formula is already correct, and PACE and SF9
populate themselves when Excel opens it.

The client-side route was ruled out on harder grounds and the finding still stands: `xlsx@0.18.5`,
the community build bundled in `app/`, **silently drops cell fills and fonts on write** — a
round-trip returns `patternType: 'none'`, erasing exactly what makes the form legible. This is
therefore the repo's first server-side spreadsheet (`phpoffice/phpspreadsheet`).

**A cell address is a property of the template, not of the curriculum.** The 604 slot addresses are
*not* in `matatag_competency_slots`; they live in `grade-1.v1.cells.json`, generated by the same
`extract.py` run that produces the catalog and keyed `path|term|macro_skill`. That kept an
`ALTER TABLE` off a table that already holds real marks, and means a DepEd reissue with two extra
columns changes the template and the map and nothing else. `WorkbookExport` refuses outright to
export a section whose pinned catalog is not the one the bundled map was built from, rather than
writing Grade 2's marks into Grade 1's columns.

**What is written:** `INPUT DATA` (school, adviser, section, roster, split into DepEd's fixed 50
male / 50 female blocks), the descriptors onto the nine class-summary sheets, both narratives per
term into the columns SF9 looks them up in, and the derived attendance. SF9 and PACE are formulas
and are left strictly alone. Formulas are **not** pre-calculated on save — Excel recalculates on
open, and asking PhpSpreadsheet to evaluate a DATEDIF/VLOOKUP chain across seventeen sheets is both
slow and unreliable.

**Two of DepEd's own defects are handled rather than reproduced.** `SF9!Q26` (July) reuses August's
VLOOKUP index, so the indices run 4, 6, 6, 7 where they should run 4, 5, 6, 7; it is repaired on the
way out, because a wrong attendance figure on a form handed to a parent is not fidelity worth
having. And `SF9!D15` ships reading `sample`, which would open the card on a wall of `#N/A`; it is
pointed at the first learner on the roster.

**All of DepEd's sample data is cleared before writing** — a learner called `sample`, a row of
descriptors, two Cebuano narratives, a month of attendance. The awkward one is
`TERM 3 LANGUAGE!K15`/`K66`: a stray `A` in a column that is not a slot in *any* term, so clearing
only the 604 mapped cells left it behind, where a teacher reading the exported form would take it
for a real mark. The clearing therefore covers the whole rating region — everything from the first
rating column rightwards in a learner's row is a descriptor by definition. Only cells the sheet
actually holds are visited; writing nulls across the full grid would create tens of thousands of
empty cells and inflate the file.

**Cost, and why it is still synchronous.** About 8 seconds and ~200 MB for one section, almost all
of it in PhpSpreadsheet's load and save of a seventeen-sheet styled workbook; the fill itself is a
few thousand cell writes. The controller raises `memory_limit` to 512 MB for that request alone.
This is a once-a-term submission for one section, and a download the teacher waits a few seconds for
beats a queue, a job table, a signed link and a polling UI for something nobody triggers twice in a
day. Whole-school export would be the point at which that changes.

Committing the template *trimmed* is what made those figures affordable — see
[`api/resources/matatag/README.md`](../../../api/resources/matatag/README.md). Four sheets shipped
padded to ~1000 empty rows where their own siblings stop at 315/120; removing that padding halved
both the time and the memory.

**`ext-zip` and `ext-gd` are now hard requirements of the API build.** The servers never run
composer — the deploy ships a prebuilt `vendor/` — so `deploy-api.yml` lists them explicitly for the
runner, and without `ext-zip` there `composer install` fails its platform check and **no API deploy
reaches any target**. At runtime a server missing one answers this route with a 503 naming the
extension, and the PDFs are unaffected.

### Pasting a block of descriptors

The teachers this module is for have been keeping these marks in DepEd's workbook, and the first
thing they try is copying a column out of it. `Ctrl+V` anchors the block at the active cell and
lands it down and to the right, the way every spreadsheet behaves. Parsing lives in
`app/src/pages/MyClassSections/components/matatagPaste.ts`; the grid stays presentational and
reports the outcome through `onPasteNotice`, which the tab turns into the one toast this screen
raises.

**It refuses rather than partly applying**, which is the whole design. These marks are single
letters, so a paste that misaligns by one row produces a grid that looks entirely plausible and says
the wrong thing about a class of six-year-olds. So:

- an unrecognised value rejects the whole block, naming the row, the column and the value — the
  usual cause is a heading row that came along with the copy;
- ragged rows reject, because every spreadsheet pads a copied block to a rectangle, and padding the
  short rows here would clear marks the teacher never touched;
- a block taller or wider than the room left from the anchor rejects rather than clipping, because
  dropping the overflow would leave the rows that *did* land shifted against the wrong learners.

An **empty** cell is not unrecognised — it means "no mark" and clears the cell, which is what an
empty cell means in the workbook too.

Pasted cells go through `onSet`, the same path a keystroke takes, so they inherit the debounced
batch write, the optimistic cache patch and the failed-cell marking without special handling.

### The narrative cap is 600 characters, and that is a decision

Unbounded prose in a fixed DepEd box has no correct rendering — the choices are shrink it until it
is unreadable, clip it, or spill onto a continuation page nobody expects. A cap at the point of
entry is the only one of the three a teacher can watch happening, so there is one, enforced by
`MatatagNarrativeController::MAX_LENGTH` and mirrored by a live counter in the client.

**The client does not carry its own copy of the figure** — `GET matatag/narratives` returns
`max_length` and the textarea's `maxLength` is bound to it. So raising the cap is a one-line change
in one file, and the screen follows on the next load. It degrades gracefully rather than suddenly
either: past the cap the card's renderer shrinks the block toward a 6pt floor before spilling to a
continuation page.

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

- **Bulk printing beyond the four jobs offered.** Every PACE form for every learner is 50 × 5 areas
  ≈ 600 pages from one click; neither the client nor the API will do it. `pace.scope` comes back
  `omitted` with a note saying how to narrow it.
- **Grades 2 and 3.** No catalog exists. Their workbooks have not been obtained, and their structure
  may differ from Grade 1's in which learning areas exist, whether an area has domains, and whether
  its list spans the year or restarts each term.
- **Key Stage 2 (Grades 4–6).** A different key stage with a different instrument. Explicitly out of
  scope; do not stretch this design to cover it on the assumption it looks similar.
- **A mid-month term boundary for attendance** — see the deviation above.
- **Mid-year migration of a live section between catalog versions** — deliberately unsupported.
- **A learner enrolled at two schools at once cannot hold two MATATAG records.** Both
  `matatag_competency_ratings` and `matatag_term_narratives` are unique on `(student_id,
  academic_year, …)` with no institution in the key, so School B's save would overwrite School A's.
  In practice this is unreachable today: `student_institutions` is
  `UNIQUE (student_id, is_active)`, so a student has at most one *active* institution — and note that
  MySQL silently drops that index's `->where('is_active', true)` clause, since it has no partial
  indexes. Left alone deliberately: adding `institution_id` to two unique keys on tables that now
  hold data is not worth doing for a case the enrolment schema already forbids. Worth knowing if
  that enrolment constraint is ever relaxed. Reads are institution-scoped either way.
