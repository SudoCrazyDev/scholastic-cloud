# DepEd Performance Report — Grades 2 to 10

> **Status: built.** The tab, the form and both gates exist. What is *not* here is listed under
> [Not yet wired](#not-yet-wired).
>
> Source of truth: **DepEd Order No. 015, s. 2026** — *Revised Guidelines on Classroom Assessment,
> Grading System, and Awards and Recognition for the K to 12 Basic Education Program*, issued
> 4 June 2026, effective **SY 2026–2027**. Every clause cited below is from the enclosure to that
> Order; paragraph numbers are its own. It repeals **DO 8, s. 2015** and **DO 36, s. 2016**.

DepEd re-issued the report card. This module prints the new one.

**For a Grade 2 to 10 section in a switched-on school, it *is* the Report Cards tab** — the older
form is hidden there, not shown beside it. Two tabs printing two different cards from the same marks
is how a parent ends up with the wrong one. Everywhere else the older card is untouched and still
the only one: every other grade level, every school without the feature, and this section too the
moment the feature is switched off. Nothing is deleted; one tab is swapped for another.

| | Existing report card | This module |
|---|---|---|
| Authority | DO 8, s. 2015 | **DO 15, s. 2026** (Annex G) |
| Title on the form | REPORT CARD | **LEARNER'S PERFORMANCE REPORT** |
| Columns | 4 quarters *or* 3 terms | **3 terms only** |
| Descriptors | Outstanding … Did Not Meet Expectations | **Advancing … Emerging** |
| Observed Values grid | yes, with AO/SO/RO/NO marks | **gone** — GMRC/VE is a learning-area row |
| Teacher's comments | none | **three boxes, one per term** |
| Page | A5 landscape × 2 | **A4 landscape × 1** |
| Grade levels | all | **Grades 2 to 10** |
| Fill-ins | value underlined, no line when empty | **a ruled blank, always drawn** |

---

## Read this first: four things that will bite you

### 1. This card cannot render a four-quarter year, and must not pretend to

Annex G is drawn with exactly three term columns, because **DO 9, s. 2026** replaced the
four-quarter calendar with a three-term one. A section whose academic year is still recorded as
`quarter` has four grades and nowhere to put the fourth.

`ClassSectionPerformanceReportTab` checks `useGradingPeriodsForYear(...).count === 3` and, when it
is not, renders an explanation instead of the form. **Do not "fix" this by rendering three of four
quarters.** A report card is a document a parent keeps; a silently dropped quarter is worse than a
tab that says why it will not print.

The tab is still *shown* for such a section, deliberately — a tab that explains itself is more use
than one that is mysteriously absent.

### 2. Grades 2 and 3 belong here, and only for now

It is tempting to read "Key Stage 1 is Grades 1–3, and KS1 is descriptive" and conclude Grades 2
and 3 have no business on a numeric form. DO 15 §55, Table 12 says otherwise — the descriptive
system arrives one grade at a time:

| School Year | Grade 1 | Grade 2 | Grade 3 |
|---|---|---|---|
| **2026–2027** | Descriptive | Numerical (adjusted transmutation) | Numerical (adjusted transmutation) |
| 2027–2028 | Descriptive | Descriptive | Numerical (zero-based) |
| 2028–2029 | Descriptive | Descriptive | Descriptive |

Annex G says so itself: *"This template may also be used for Grades 2 and 3 during the SYs in which
the numerical grading system is still being implemented."*

So `isGradeTwoToTen` is a **transitional** rule with an expiry. When a school's Grade 2 sections
move onto the MATATAG competency grid (SY 2027–2028) and Grade 3 follows (SY 2028–2029), those
grades stop wanting this form. It is not wired to the calendar — a school simply stops using the tab
for those sections, or the rule narrows to Grades 4–10 then.

### 3. The older card is hidden, not removed

`ClassSectionDetail` swaps the tab rather than adding one:

```
...(showPerformanceReport
  ? [{ key: 'performance-report', ..., label: 'Report Cards' }]
  : [{ key: 'report-cards',       ..., label: 'Report Cards' }]),
```

`showPerformanceReport` already carries the feature, the module and the grade range, so the fallback
is the *only* branch a school without the feature can take. **Do not simplify this to an unconditional
hide.** If the check ever widens past those three conditions, a school could lose its report cards
altogether — the old tab is the default, and the new one has to earn its place each render.

`studentReportCard.tsx`, `StudentReportCardModal` and `handleViewReportCard` are all still wired and
still reachable from every other section.

### 4. Nothing here writes anything

Every figure on the form is owned by another module. Consolidated Grades writes the marks, Student
Attendance writes the days, Class Sections owns the adviser. This module reads
`useStudentReportCard` — the *same* hook the existing card reads — and lays the result out on a
different sheet.

That is why the module declares `base_abilities => ['view']` and offers no Manage. A Manage here
would suggest the card is a second place to correct a grade, which it is not.

---

## The two gates

Both, and in this order:

- **Feature** `deped-performance-report` — `config/features.php`, `default_enabled => false`.
  The platform switches a school on. Off by default because which of two report cards a parent is
  handed is the school's announcement to make, not a deploy's.
- **Module** `deped-performance-report` — `config/modules.php`, under **Academics**, `view` only,
  plus a `view-all` special for reach across sections a person does not advise.

Plus a third, narrower condition that is not a gate at all: the section has to be **Grades 2 to 10**
(`isGradeTwoToTen`). Grade 1 is on the MATATAG grid with its own progress report; Grades 11 and 12
use the same annex but with Track and elective rows this form does not draw.

`2026_09_15_000001_grant_deped_performance_report_permission.php` grants the module to existing
tenants' roles, because `SystemRolePermissions` only takes effect when a role is *created*. Granting
it broadly is safe for the same reason the MATATAG grant is: the feature is off, and
`EnsureFeatureEnabled` does not honour the super-administrator wildcard.

### There is no API route to gate, and that is the one weak spot

This module adds **no endpoints**. It renders from `students`, `student-running-grades`,
`student-attendances`, `school-days` and `institutions` — all of which the person opening this tab
could already reach through the older report card, and can still reach on any other section. So the
module permission is enforced in the SPA only.

That is honest here because **no new data is exposed** — this is a second layout of records the
caller already has. If a future change gives this module an endpoint of its own (a server-rendered
PDF, a bulk download, a stored adviser remark), that route **must** carry
`feature:deped-performance-report` and `module:deped-performance-report,view` like every other.

---

## The form

Annex G, one A4 landscape sheet, two columns.

**Left column** — DepEd header (Region / Schools Division Office / school, both logos), the title
`LEARNER'S PERFORMANCE REPORT`, the learner strip (Name, Age, Sex / LRN, Grade, Section), the
"Dear Parents" letter, `LEARNING PROGRESS AND ACHIEVEMENT`, and the descriptor legend.

**Right column** — `ATTENDANCE RECORD`, `TEACHER'S COMMENTS/REMARKS`,
`PARENTS/GUARDIAN'S SIGNATURE`, `CERTIFICATE OF TRANSFER`, `CANCELLATION OF ELIGIBILITY TO TRANSFER`.

### The learning-area table

`Learning Areas | TERM 1 2 3 | Final Grade | Remarks`, then `General Average`.

Rows are the section's own subjects in their own order, parents before their children, a child
indented and italic. The row list is **data, not a constant** — DepEd's printed template lists
Filipino / English / Mathematics / Science / AP / GMRC-VE / EPP-TLE / MAPEH because that is the
Grade 4–12 set, but a Grade 2 section under MATATAG carries Language, Reading & Literacy,
Mathematics, GMRC and Makabansa instead. Both render correctly because neither is hardcoded.

A **child row carries term marks and no final grade** — the parent row holds the area's final grade,
which is what §52 averages. Final Grade and Remarks only appear once all three terms are marked.

**General Average** (§53) is the mean of the areas' final grades, whole number, and prints only when
every area the learner has marks in is complete for all three terms. A part-year average on a card a
parent keeps reads as a final one. Areas the learner has no grades in are skipped rather than
counted as zero — a section may offer four specialisations and a learner take one.

### The descriptors

Table 11 of the Order, in `depedPerformanceDescriptors.ts`:

| Grade | Descriptor | Remarks |
|---|---|---|
| 90–100 | Advancing *(Namumukod-tangi)* | Passed |
| 80–89 | Benchmarking *(Napamamalas)* | Passed |
| 75–79 | Connecting *(Natutungo)* | Passed |
| 65–74 | Developing *(Napauunlad)* | Failed |
| 0–64 | Emerging *(Nagsisimula)* | Failed |

They live in their own file precisely so the two cards' legends cannot drift into each other. **Do
not** reuse `getGradeRemarks` from `gradeUtils` here — that is DO 8's wording and the older card
still needs it.

The passing mark stays **75**. DO 15 raises the *raw* score behind it, not the number on the card:
for SY 2026–2027 an Initial Grade of 70.00 transmutes to 75 (Annex D, Table 4), and from
SY 2027–2028 transmutation goes away entirely and 75 raw is the pass. **Neither is implemented
here** — see [Not yet wired](#not-yet-wired).

### Attendance

Three rows — `No. of Class Days` / `No. of Days Present` / `No. of Days Absent` — over Jun–Mar plus
a Total, from `school_days` and `student_attendances`. Only *absent* is stored; present is the
month's class days minus it, exactly as the older card derives it, so the two cards can never
disagree.

`ACADEMIC_YEAR_MONTHS` is **re-declared locally rather than imported** from `studentReportCard.tsx`.
DepEd leaves Annex G's month headings blank for the school to fill, so the two forms' month tables
are free to diverge; a shared constant would tie a change in one to the other silently.

### Every fill-in is a ruled blank, and every cell is a sibling

Two layout rules that are easy to undo by accident, both learned the hard way:

**`RuledBlank`, not underlined text.** Annex G draws a rule under every fill-in — Name, LRN, Age,
Sex, Grade, Section, the signature lines, the transfer grades — and the rule is there whether or not
anything is written on it. The older card underlines the *text*, which gives a line only as wide as
the value and no line at all when there is nothing to print. That is a different document. The
helper uses `flexGrow`/`flexBasis: 0` so a row of blanks divides the space it is given, rather than
being a guessed number of underscores that a longer label pushes off the edge.

**Table cells are flat siblings of the row, never nested in a column wrapper.** The term cells were
first written as three cells inside one 27%-wide `View`. The wrapper stretched to the row height,
but the inner row did not — it was only as tall as its own text — so on any row the Learning Areas
cell made taller (a wrapped title, or a parent like MAPEH sitting above its children) the cells'
right-hand rules stopped short and the column read as broken. Flex children stretch to the row by
default; nesting is what takes that away. Body cells are therefore `width: 9%` of the whole row
(`termCellWidth`), matching the header band's `33.33%` of its own 27% exactly.

### Teacher's comments print blank

Three ruled boxes, labelled Term 1/2/3, empty. That is what DepEd's template is — the adviser writes
in them — and the platform stores no per-term adviser remark for a numeric section. (MATATAG's term
narratives are Key Stage 1 only and are not this.)

---

## File map

### API

| Path | What it does |
|---|---|
| `config/features.php` | `deped-performance-report`, `default_enabled => false` |
| `config/modules.php` | the module, under `academics`, `base_abilities => ['view']` + `view-all` |
| `app/Support/SystemRolePermissions.php` | `VIEW` for the school-side roles, `SPECIAL` for `view-all` |
| `database/migrations/2026_09_15_000001_grant_deped_performance_report_permission.php` | grants it to existing tenants' roles |

**No controller, no route, no model, no migration of schema.** See
[the weak spot](#there-is-no-api-route-to-gate-and-that-is-the-one-weak-spot).

### Frontend

| Path | What it does |
|---|---|
| `components/depedPerformanceReport/DepedPerformanceReportCard.tsx` | the `@react-pdf/renderer` document |
| `components/depedPerformanceReport/depedPerformanceDescriptors.ts` | Table 11 bands, and the lookup |
| `pages/MyClassSections/components/ClassSectionPerformanceReportTab.tsx` | the tab: searchable learner picker, school-head picker, the four-quarter refusal |
| `pages/MyClassSections/ClassSectionDetail.tsx` | `showPerformanceReport`, the tab swap, the panel, the redirect off a hidden tab |
| `utils/gradeLevel.ts` | `parseGradeLevelNumber`, `isGradeTwoToTen` |

The viewer is remounted on a key rather than updated in place — react-pdf v4 mis-renders on
incremental prop updates. Same trick as `StudentReportCardModal` and `MatatagReportsPanel`, same bug.

---

## Integration

**This module consumes, and is consumed by nothing.** Nothing reads from it; it has no tables and no
endpoints. What it reads:

| From | Via | Used for |
|---|---|---|
| Consolidated Grades | `student_running_grades` (`useStudentReportCard`) | term grades, final grades, general average |
| Student Attendance + School Days | `student_attendances`, `school_days` | the attendance table |
| Class Sections | `class_sections.adviser_user`, `grade_level`, `title` | adviser line, gating, the learner strip |
| Subjects | `subjects` (parent/child, `order`) | the learning-area rows |
| Staffs | `staffService.getStaffs` filtered to `principal` | the School Head line |
| Institutions | `institutions`, `useInstitutionLogo` | the DepEd header |
| Academic year config | `useGradingPeriodsForYear` | three-terms check, period labels |

**Consumers to be careful of:** a change to `useStudentReportCard`'s return shape breaks *both*
report cards at once. That hook is now shared by two documents with different layouts, and the older
one is the one a school is still handing out.

---

## Not yet wired

- **Bulk download.** One learner previews at a time. There is no "download the whole section"
  button — `MatatagReportsPanel` has the pattern to copy if one is wanted.
- **Adviser remarks per term.** The three comment boxes print blank. Storing them needs a table and
  an editor, and then this card reads them.
- **Transmutation.** DO 15 §48 mandates an adjusted transmutation table for SY 2026–2027
  (raw 70.00 → 75, floor 60) and §50 a zero-based system with no transmutation from SY 2027–2028.
  The platform's existing grading scales are unchanged, so **what this card prints is whatever
  Consolidated Grades computed**. Getting the transmutation right is a grading-engine change, not a
  report-card one.
- **Component weights.** §44, Table 9 sets WW 20 / PT 50 / EX 30 for English, Filipino, Math,
  Science, AP and GMRC-VE, and 20 / 60 / 20 for EPP-TLE and MAPEH, with the EX component split
  ST1 30 / ST2 30 / Term Exam 40 (§45). Also a grading-engine matter, also untouched.
- **Grades 11 and 12.** Annex G covers them, with Track and elective rows and a General Average
  computed on subject units (§53). Not drawn.
- **Awards and recognition.** DO 15 replaced DO 36, s. 2016 wholesale (Annex H). The platform's
  honors wording in `getGeneralAverageRemarks` is still DO 36's and is not printed on this card.
