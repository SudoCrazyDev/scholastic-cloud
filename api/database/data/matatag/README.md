# MATATAG catalog data

The DepEd Key Stage 1 competency catalogs, and the script that pulls them out
of DepEd's workbooks.

| | |
|---|---|
| `extract.py` | reads a DepEd workbook, writes a catalog JSON, prints a report |
| `grade-1.v1.json` | Grade 1, from `2026_v1.0` of the workbook — 199 competencies, 604 slots |

Loaded by `App\Services\Matatag\CatalogLoader`, which a data migration calls so
the catalog arrives everywhere a deploy does. `php artisan matatag:load-catalog`
does the same thing to a running environment without a deploy.

**Read `docs/modules/MatatagKeyStage1/MATATAG.md` first.** It explains the data
model, why this is not in `config/`, and how a catalog version is pinned so a
revision cannot disturb descriptors already recorded.

## Running it

```bash
cd api/database/data/matatag
python extract.py ../../../../docs/modules/MatatagKeyStage1/KEY_STAGE_1_GRADE_1_3_TERM.xlsx \
    --grade "Grade 1" --code deped-matatag-ks1-grade-1-v1 -o grade-1.v1.json
```

Needs `openpyxl`. It only ever reads the workbook.

## Read the report

The script prints per-area counts, slots per term, unknown fill colours and an
**anomalies** list. A run with anomalies is normal — DepEd's own file has
several defects — but each one is a judgement the script made on your behalf,
and you should agree with it before loading. A silent run is not a successful
run. Grade 1 currently reports six anomalies.

Cross-check the counts by hand against the PACE sheets. The loader asserts the
JSON's own `counts` against what it actually inserts and rolls back the whole
transaction on a mismatch, so a bad extraction fails loudly rather than
half-loading — but it can only check the file against itself, not against DepEd.

## How a slot is decided

A slot is **(competency × macro skill × term)**, and two different sheets
answer two different questions:

- **`PACE - GRADE 1`** gives the competency tree: numbering, lettered children,
  domain bands, wording, and GMRC's performance standards.
- **The class-summary sheets** (`TERM n READING & LITERACY` and friends) say
  which slots exist in which term, and whose they are. **A slot exists in a term
  if and only if its cell carries a macro-skill fill colour in that term's
  sheet.** Cells for a competency not taught that term are filled black or with
  a theme colour. Rows 12 and 13 above the cell name the competency it belongs
  to.

The fills are authoritative. Both signals were compared across all three
Reading & Literacy sheets and agree exactly (74 / 76 / 91), disagreeing only
where DepEd's formulas are wrong. Reading existence from the fills keeps those
defects out of the catalog for free, and every area and term now reconciles
against the workbook exactly.

### Never carry a column number between term sheets

The three term sheets **do not share a column layout**. `TERM 3 LANGUAGE` is two
columns wider than Terms 1 and 2, because DepEd inserted an extra child pair
under competency 6, so every column after it is shifted by two.

Looking a Term-1 column number up in the Term-3 sheet therefore reads a
neighbour's cell — and nearly gets away with it, because where both children are
assessed it lands on another filled cell and **the totals still come out right**.
In Grade 1 it cost one pair: Language competency 8 is assessed on child `b` in
Term 3, and the shifted read credited it to child `a`.

Each sheet is read entirely on its own, so a layout that shifts cannot
misattribute anything. Two quirks of DepEd's heading rows, both handled: row 13
is written only on the first column of a child's pair, so a blank inherits the
letter to its left; and a competency with no lettered children repeats its own
number on row 13, which means "no child".

**Assume the next grade level's workbook has the same class of defect.**

## The macro-skill palette

The workbook records a slot's language macro skill **only** as the background
colour of its cell. There is a printed legend and no machine-readable label
anywhere in the file.

| ARGB | Macro skill |
|---|---|
| `FFFDE49A`, `FFFFE598` | Listening |
| `FFC9A6E6` | Speaking |
| `FFFFA766`, `FFF7B083` | Reading |
| `FFC4E0B3` | Copying and Guided Writing in response to Comprehension Questions |
| `FF000000`, theme fills | not taught this term — no slot |

`MACRO_SKILL_FILLS` in `extract.py` **must match** `macro_skills.*.fills` in
`api/config/matatag.php`. If a future workbook uses shades we have not seen, the
run reports them under `UNKNOWN FILLS` rather than dropping the slots quietly;
add them in both places and re-run.

## Adding Grade 2 or Grade 3

**Neither is due yet.** DepEd Order 015, s. 2026 §55 phases descriptive grading in one grade level
per year: Grade 1 from SY 2026–2027, Grade 2 from **SY 2027–2028**, Grade 3 from **SY 2028–2029**.
Until each date those grades are graded numerically, so a missing catalog is a grade level DepEd has
not moved yet rather than a gap in this directory. See the module doc's
[transition table](../../../../docs/modules/MatatagKeyStage1/MATATAG.md#key-stage-1-is-phased-grade-2-and-grade-3-are-still-numeric).

1. Get the official workbook. Ask early — without it there is no catalog.
2. Run the script against it with a new `--grade` and `--code`.
3. Read the report. Resolve every anomaly and every unknown fill.
4. Commit the JSON here.
5. Add a data migration calling
   `(new CatalogLoader)->loadFile(database_path('data/matatag/grade-2.v1.json'), makeDefault: true, force: true)`,
   modelled on `2026_09_14_000006_load_matatag_ks1_grade_1_catalog.php`.

No code changes. Different learning areas, different domains, a different shape
per area, different pacing and a new macro skill are all absorbed as data — see
the table in the module doc. The script's `AREAS` list describes where each
area sits in the PACE form, so a workbook that lays its sections out elsewhere
needs that list adjusted; everything else follows.

**A revision to a grade level already in use is a new version, never an edit.**
Give it a new `--code`, commit it beside the old one, and leave the old file in
place. The loader refuses to touch a version that already has descriptors
recorded against it.

## Defects in DepEd's Grade 1 workbook

All are handled and reported. They are described in full in the module doc.

| Where | What the script does |
|---|---|
| `PACE!I109`, `I110` — a Language competency reads from a Reading & Literacy sheet | drops the formula; the fills supply the right slots |
| `PACE!R112` reads Term 2, `PACE!R141` reads Term 1, where Term 3 is meant | harmless — the fills decide the term, not the formula |
| Maths Term 2 numbers competency 3's children as top-level 3, 4 and 5 | keeps them as children `b` and `c`, drops the stray numbers |
| `TERM 3 LANGUAGE` is two columns wider than Terms 1 and 2 | reads every sheet on its own headings, so nothing is misattributed |
| `TERM 3 LANGUAGE` `AS`/`AT` duplicate competency `6b`'s heading | reports the duplicate column and drops it — Term 3 Language has 95 slots, not the 97 cells that are filled |
| `SF9!Q27` shows July's attendance figure for August | not used — attendance is derived from the platform's own records |
| GMRC Term 3 competency 3 repeats competency 4's performance standard | carried through verbatim; DepEd's text, not ours to correct |
