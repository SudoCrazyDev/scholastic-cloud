# Grade 1: the existing numeric scores, and what becomes of them

> **Status: analysis complete, decision pending.** Nothing here has been built or changed. This
> records what was found in Maranatha General Santos' live database on **2026-09-17**, so the
> meeting with the Grade 1 advisers and subject teachers starts from measured fact rather than from
> guesses about what the quiz records contain.
>
> The open questions are collected in [For the meeting](#for-the-meeting). Everything above that
> point is verified and reproducible; the queries are in [How to re-check this](#how-to-re-check-this).
>
> Read [`MATATAG.md`](MATATAG.md) first. This doc assumes its data model — slot, term, descriptor,
> macro skill — and does not re-explain it.

## The question

Maranatha's Grade 1 sections spent Quarter 1 grading numerically: quizzes, activities and
assignments recorded in the ECR, with points and percentages. Then both sections were opted into
MATATAG, which wants a letter **A–E** against each learning competency instead.

**Can that quarter of numeric work be turned into MATATAG descriptors?**

## The short answer

**Not converted. But read from — and that is what DepEd actually asks for.**

There is no arithmetic that turns a quiz percentage into a defensible descriptor, for three reasons
set out [below](#why-conversion-fails). But the quiz records are not waste and must not be
described to teachers as waste: DepEd requires the descriptor to rest on *"a series of formative
tasks and activities"* across the term, and the ECR **is** that record.

For Term 1 the split is roughly **46 of 191 marks can be read almost directly off the class record;
the other 145 come from the adviser's judgement of a child they have taught** — because those 145
are Listening and Speaking, which no written quiz measured.

---

## What is actually there

Maranatha General Santos, institution `019c9375-638a-734f-8a9c-d65a18cb82b6`, SY 2026–2027,
as of 2026-09-17.

### Both Grade 1 sections are already opted in, and neither has been marked

| Section | Id | Opted in | Descriptors entered |
|---|---|---|---|
| Grace | `019e8b5b-c4d7-7061-a48b-6bb13b0eb16c` | 2026-09-15 02:07 | **0** |
| Compassion | `019e8b63-6162-729c-b33a-002d2ea56dca` | 2026-09-14 19:29 | **0** |

`matatag_competency_ratings` and `matatag_term_narratives` are **empty institution-wide**. The
module is switched on and untouched. Whatever is decided at the meeting, nothing has to be undone.

### The subjects already are the five learning areas

Grace's subjects are `GMRC`, `MAKABANSA`, `READING AND LITERACY`, `LANGUAGE`, `MATHEMATICS` — one
per MATATAG learning area, all `grading_type = 'numerical'`. Compassion's are the same five under
slightly different casing and shortening (`Math`, `Reading and literacy`).

This matters more than it looks. A naive reading of the two systems assumes the school's subjects
would have to be mapped onto DepEd's learning areas; here they already line up one to one. **Any
future mapping by title must be case- and abbreviation-tolerant**, because the two sections do not
spell them the same way.

### All of it is Quarter 1

There is no Q2, Q3 or Q4 data anywhere in Grade 1. This is a mid-year switchover, not a historical
migration: the question is what to do with *this* term's work, not with past years'.

| Section | Items | Scores recorded |
|---|---|---|
| Grace | 63 | 1,904 |
| Compassion | 67 | 1,685 |
| **Total** | **130** | **3,589** |

Grade 1 also has **304 `student_running_grades` rows for Q1**. See
[For the meeting](#for-the-meeting) — teachers will ask what those are now for.

### What Term 1 needs, against what Q1 produced

Grace, Term 1:

| Learning area | Term 1 slots | Q1 items |
|---|---|---|
| Reading and Literacy | 74 | 10 |
| Language | 89 | 13 |
| Mathematics | 17 | 17 |
| GMRC | 7 | 11 |
| Makabansa | 4 | 12 |
| **Total** | **191** | **63** |

191 slots × 34 learners = **6,494 descriptors for Grace, Term 1 alone.**

Read as a bare ratio this looks hopeless, and that reading is wrong. See
[the reframe](#the-reframe-a-method-mismatch-not-an-evidence-shortage).

---

## Why conversion fails

Three independent reasons. Any one of them is sufficient; together they close the question.

### 1. The scores do not discriminate

Per-learner Q1 percentage in Grace, by subject:

| Subject | ≥90% | 80–89% | 70–79% | <70% | Lowest |
|---|---|---|---|---|---|
| Reading and Literacy | **30** | 2 | 0 | 0 | 83.9% |
| Makabansa | **29** | 3 | 0 | 0 | 80.0% |
| Mathematics | 22 | 10 | 1 | 0 | 74.3% |
| Language | 21 | 13 | 0 | 0 | 80.0% |
| GMRC | 18 | 12 | 1 | 1 | 69.0% |

Any percentage-to-letter cut-off gives **94% of the Reading and Literacy class the same
descriptor**. The column would be a constant and would carry no information about any child.

This is not a badly chosen band. These are Grade 1 formative quizzes — mastery-oriented, short, and
re-taught until the class gets them — so they are not built to spread learners out, and no cut-off
can recover a spread that was never there.

The denominators are also uneven: at least two learners have three or fewer scored items in a
subject, one with a single 10/10. A percentage makes them top of the class.

### 2. The quizzes never measured most of what Term 1 asks about

This is the decisive one. Term 1's 191 slots, by macro skill:

| Evidence type | Slots | Share |
|---|---|---|
| Listening (Language 45 + R&L 26) | 71 | |
| Speaking (Language 44 + R&L 30) | 74 | |
| → **observational subtotal** | **145** | **76%** |
| Reading (R&L) | 14 | |
| Copying and guided writing (R&L) | 4 | |
| No macro skill — Math 17, GMRC 7, Makabansa 4 | 28 | |
| → **paper-evidenceable subtotal** | **46** | 24% |

**Language Term 1 is 100% Listening and Speaking** — zero reading, zero writing slots.

You cannot evidence *"Respond to teacher's instructions — Listening"* with a pen-and-paper quiz.
Three quarters of Term 1 was never quizzable, so for those slots there is nothing to convert.

### 3. DepEd provided no conversion, deliberately

There is no transmutation table anywhere in the instrument. The PACE form's own instruction is that
the teacher records attainment *"on a regular basis throughout the term, not as a one-time entry"*,
based on *"sufficient and varied evidence of learning, including learner outputs"*.

A derived letter would be a fabricated professional judgement, written to the database under a real
teacher's `marked_by` and printed on a government form. `ProgressReport` already has a test
asserting no key matching `/average|final_grade|transmuted|grade$/` appears in the payload; a
transmutation would be the module contradicting itself.

### And structurally, there is no join anyway

Verified on the live database: no column named `competenc%`, `slot%` or `learning_area%` exists
outside the `matatag_*` tables, and no foreign key points into them from anywhere else. An ECR item
records subject, quarter and points; a slot records competency, macro skill and term. The two meet
nowhere.

---

## The reframe: a method mismatch, not an evidence shortage

The "63 items against 191 slots" framing counts quizzes as though a quiz were the right evidence for
every slot. Once the slots are split by macro skill, the picture inverts.

**The 46 paper-evidenceable slots are covered, some over-covered:**

| | Slots | Grace items |
|---|---|---|
| Mathematics | 17 | 17 |
| GMRC | 7 | 11 |
| Makabansa | 4 | 12 |
| R&L reading + copying/guided writing | 18 | 10 |

**The 145 observational slots were never going to be quizzed.** They are Listening and Speaking.

So there is no evidence shortage. There are two real gaps, and neither is the one that was
originally diagnosed:

1. **No way to record an observation** other than the descriptor itself.
2. **No sense of where you are** in 191 columns.

---

## Recommended approach

**Pace the marking. Do not build a bridge from the quizzes.**

### 1. Use the focus list, not the wide grid

`MatatagFocusList` already exists and was built for exactly this: one competency, the whole class,
no horizontal scrolling. Its own docblock explains why — Term 3 Reading & Literacy is 91
competencies wide, roughly 3,000 pixels of table, which does not fit a school laptop.

Nobody has used it: zero ratings in either section.

The workload restated honestly: Term 1's 6,494 marks for Grace are **191 focus-list screens**, one
competency at a time, 34 names each. Term 2 runs about 13 weeks, so ≈**15 screens a week** across
all five learning areas. That is a manageable weekly habit and an impossible term-end scramble.
**The difference between those two is a scheduling decision, not an engineering one.**

### 2. Build one thing: a coverage indicator

There is none today — `MatatagTab.tsx` has a "MATATAG Progress" heading and no progress in it.

The real failure mode is not missing evidence; it is an adviser facing 191 columns with no idea
which are done. A per-(area, term) count of marked slots against `CurriculumTree::columnsFor()`,
plus *which learners are missing marks in this column*, is a cheap query against
`matatag_competency_ratings` and is what turns the focus list from a wall into a worklist.

**This is the highest-value thing to ship for this problem.** Not yet built.

### 3. Let Term 1 close retrospectively

Term 1 is June–September and the analysis was done on 17 September. The adviser marks from recall
plus the ECR for the 46 paper-evidenceable slots. That is defensible: it is still a teacher's
judgement of a child they have taught for a term. Term 2 is where the weekly rhythm starts.

### What not to build

**Quiz-to-competency tagging was proposed and then dropped.** It is recorded here so it is not
re-proposed without the counter-argument.

The idea: a join table tagging each `subject_ecr_item` with the competencies it assessed, so the
grid could show which quizzes back each column. It survives the "no join exists" objection, is
additive, and the item titles partly support it — several name a competency verbatim ("Week 2
Quiz:1 *Participate in Classroom Interactions Using Verbal and Nonverbal Responses*" is Language
competency 2).

**The macro-skill breakdown kills its value.** It would serve only the 46 paper-evidenceable slots,
which already have more quizzes than slots, and do nothing for the 145 that are the actual work.

Title quality also collapses exactly where it would be needed. Items whose title names a topic at
all, both sections:

| Subject | Items | Titles naming a topic |
|---|---|---|
| Makabansa | 25 | 25 |
| Mathematics (Grace) | 17 | 17 |
| Math (Compassion) | 14 | 12 |
| GMRC | 26 | 14 |
| Language | 23 | 8 |
| **Reading and Literacy** | 25 | **4** |

Reading and Literacy — the largest slot count — is almost entirely "Week 4: QUIZ 1". There is
nothing to match against.

Revisit only if a later term's skill mix shifts toward reading and writing. R&L Term 2 adds 76
slots; re-check its composition before deciding.

### Also rejected: restructuring the ECR components into MATATAG domains

Considered during analysis: replace the ECR components (Written Works / Performance Task /
Examination) with the MATATAG domains (*Language for Interacting with Others*, and so on), so the
numeric record mirrors the competency tree.

Rejected for three reasons:

1. **`subjects_ecr.percentage` is a weight, not a label.** Components must sum to 100 and the weight
   feeds `student_running_grades`. Domains carry no DepEd weight; five would have to be invented,
   and every Grade 1 numeric grade would silently change meaning.
2. **It still cannot express the macro skill.** An ECR item has exactly one score; a slot needs a
   mark per macro skill. Getting one score per slot means one item per (child × macro skill) —
   Language Term 1 alone is 89 items × 34 learners = 3,026 numeric entries per section per term,
   the same keystroke count as the grid but routed through a numeric form whose output then has to
   be transmuted, which returns to [reason 1](#1-the-scores-do-not-discriminate).
3. **It breaks the module's founding invariant** — MATATAG is additive and must never alter numeric
   grading, pinned by `GradingPeriodStructureTest`. Grades 2 and 3 are still numeric until
   SY 2027–2028 and SY 2028–2029 and share this machinery.

The macro skill is a dimension of the **rating**, not of the assessment. It already has a home:
`matatag_competency_slots` is `UNIQUE (competency_id, term, macro_skill)`,
`CurriculumTree::columnsFor()` emits one column per slot carrying its `macro_skill`, and
`MatatagGrid.tsx` renders the macro-skill header row in DepEd's own fill colours.

For Language competency 2 in Term 1 the grid already draws what the restructure was trying to reach:

```
Language for Interacting with Others              <- domain band
  2  Participate in classroom interactions...     <- parent, is_rateable = 0, holds no slots
     a. Respond to teacher's instructions   |  b. Ask and respond to questions
     [Listening] [Speaking]                 |  [Listening] [Speaking]
```

---

## For the meeting

Open questions. None of these are engineering decisions.

1. **Does Grade 1 still print a numeric report card this year?** There are 304 Q1 running-grade rows
   sitting in the database. Under DO 15 Table 12 Grade 1 is descriptive from SY 2026–2027, so the
   MATATAG card is the official one — but teachers who spent a quarter entering scores will ask what
   those numbers are now for, and "they are your evidence trail" is only satisfying if it is true.
2. **Is ≈15 competencies a week realistic for Term 2?** That figure is arithmetic (191 slots ÷ 13
   weeks), not a commitment anyone has made. If it is not realistic, that is a staffing conversation
   and it is better had now than in December.
3. **Who marks what?** MATATAG makes the **adviser** the record owner for all five learning areas,
   but Maranatha has subject teachers running these subjects' ECRs. Either the adviser marks from
   the subject teachers' evidence, or the subject teachers are given `matatag-grading` `manage`.
   The module supports both; the school has not chosen.
4. **Is Q1 → Term 1 the school's intent?** Assumed throughout. MATATAG Term 1 is June–September and
   Q1 is the only data present, so it is the natural reading, but it has not been confirmed.
5. **Does Compassion get the same treatment as Grace?** Its numbers are very close and nothing in
   the analysis is Grace-specific, but only Grace was examined in detail.

### What to tell the teachers

Plain-language summary, for the advisers:

> Your quiz records are not lost and you will not be re-entering them.
>
> MATATAG asks for a letter (A–E) per competency, not a number, and there is no formula that turns a
> quiz score into a letter — DepEd did not provide one, on purpose. The letter is your judgement of
> the child.
>
> Your quizzes still matter. DepEd requires that judgement to rest on a series of tasks and
> activities across the term, and your class record *is* that evidence. Keep it open while you mark.
>
> Roughly a quarter of your Term 1 marks — Mathematics, GMRC, Makabansa, and the reading and writing
> parts of Reading and Literacy — you can read almost directly off your class record.
>
> The other three quarters are **Listening and Speaking**. A written quiz never measured those, so
> there was never anything there to convert. You mark those from having taught the child this term,
> which is what DepEd intends.
>
> Use the **focus list** rather than the wide grid: one competency, the whole class on one screen,
> instead of scrolling sideways.
>
> From Term 2 we will spread this across the term — about 15 competencies a week — instead of
> leaving it to the end.

---

## Separate finding: `extract.py` misreads a workbook whose numbers are floats

Unrelated to the migration question, found while checking whether the
`UPDATED-Grade-1-ECR-PACE-Form-and-SF9-1.xlsx` the school received was a new DepEd release.

**It is not a new release.** Its extracted catalog is byte-identical to `grade-1.v1.json` — 199
competencies, 604 slots, every top-level key hash-equal — and it carries the same `2026_v1.0`
marker in `INPUT DATA!T62`. Every cell difference is DepEd clearing the sample learner ("sample",
LRN 1234566776) out of the template. **No new catalog version is needed.**

Getting there exposed a real bug. The updated file stores integers as floats (`1` becomes `1.0`),
and `extract.py` tests `label.isdigit()`, which is `False` for `"1.0"`:

| Run | Competencies | Slots |
|---|---|---|
| Committed workbook (control) | 199 | 604 |
| Updated workbook, extractor as-is | **178** | **90** |
| Updated workbook, `clean()` normalising a trailing `.0` | 199 | 604 |

This is worse than the README's *"a silent run is not a successful run"* warning covers. The loader
asserts the JSON's **self-declared** counts, and a 90-slot file declares 90 — so a corrupted catalog
would load cleanly. The only thing standing between it and the database is the manual hand-count
step in the runbook.

The float problem hits both places the extractor reads a number: the PACE numbering column
(`extract.py:257`) and the class-summary heading rows 12/13 (`extract.py:431-432`). Patching
`clean()` (`extract.py:168`) covers both — normalise a string that is entirely digits followed by
`.0` to its integer form. **Not yet applied.** Worth landing before Grade 2's workbook arrives,
since a workbook saved by a different version of Excel is exactly how this recurs.

---

## How to re-check this

Everything above is reproducible.

**The catalog comparison** — run the extractor against any workbook and diff its JSON against the
committed artifact:

```bash
cd api/database/data/matatag
python extract.py <workbook.xlsx> --grade "Grade 1" \
    --code deped-matatag-ks1-grade-1-v1 -o /tmp/check.json
# then compare counts and per-area totals against grade-1.v1.json
```

**The tenant figures** were read from Maranatha's production database on 2026-09-17 with read-only
`SELECT`s. The load-bearing ones, and where they come from:

| Figure | Source |
|---|---|
| Opt-in state, zero ratings | `matatag_section_curricula`, `matatag_competency_ratings` |
| Items and scores per subject | `subjects` → `subjects_ecr` → `subject_ecr_items` → `student_ecr_item_scores` |
| Term 1 slots per area, and per macro skill | `matatag_competency_slots` joined to `matatag_learning_areas`, `term = 1` |
| Per-learner percentages | `SUM(score) / SUM(item.score)` grouped by student and subject |

**These figures are a snapshot.** If the advisers begin marking after the meeting, the "zero
ratings" premise stops holding — re-run before relying on any of it.
