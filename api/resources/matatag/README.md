# The MATATAG workbook template

`KEY_STAGE_1_GRADE_1_3_TERM.template.xlsx` is DepEd's official Key Stage 1
e-class record, committed here so `App\Services\Matatag\WorkbookExport` can
fill it in and hand a school back a file the division office recognises.

The pristine original is at
[`docs/modules/MatatagKeyStage1/KEY_STAGE_1_GRADE_1_3_TERM.xlsx`](../../../docs/modules/MatatagKeyStage1/KEY_STAGE_1_GRADE_1_3_TERM.xlsx).
**That one is the reference; this one is the build input.** They differ in
exactly one way, described below.

## Why a copy lives under `api/`

The deploy workflow is path-filtered on `api/**` and ships a zip of that
directory. Nothing outside `api/` reaches a server, so the export cannot read
the copy in `docs/`.

## What was changed from DepEd's file

Four sheets shipped with their dimensions padded out to ~1000 rows, where their
own siblings stop much earlier and every row past that point is empty:

| Sheet | DepEd's extent | Trimmed to | Its siblings |
|---|---|---|---|
| `TERM 1 READING & LITERACY` | 1000 rows | 315 | Terms 2 and 3 are 315 |
| `TERM 1 LANGUAGE` | 1000 rows | 315 | Terms 2 and 3 are 315 |
| `TERM 2 SUMMARY` | 1000 rows | 120 | `TERM 1 SUMMARY` is 120 |
| `TERM 3 SUMMARY` | 1000 rows | 120 | `TERM 1 SUMMARY` is 120 |

That padding was 43% of the file — those four sheets alone were 4.9 MB of 11.4
MB uncompressed — and it was almost all of the export's cost. The learner rows
end at 115/116 on every one of them, so nothing was removed that anything can
reach.

The effect, measured on a real section:

| | DepEd's file | Trimmed |
|---|---|---|
| Load + fill + save | 14.4 s | **8.0 s** |
| Peak memory | 326 MB | **204 MB** |
| File on disk | 1.59 MB | **0.86 MB** |

Nothing else was touched. Fills, formulas, merges, print areas, sheet
protection and the seventeen sheets all survive, which is verified by
`MatatagWorkbookExportTest` reading the export back cell by cell.

The trim was applied with PhpSpreadsheet itself — the same library that reads
the template at export time — so it cannot have lost anything the export would
have kept. (openpyxl was **not** used for this: it warns that it drops the
`INPUT DATA!F27` data validation, and DepEd's grade-level dropdown is worth
keeping.)

## Receiving a new DepEd file

1. Put the new original in `docs/modules/MatatagKeyStage1/`.
2. Re-run the extractor to regenerate the catalog **and the cell map**:
   ```bash
   cd api/database/data/matatag
   python extract.py ../../../../docs/modules/MatatagKeyStage1/<file>.xlsx -o grade-1.v1.json
   ```
   It writes `grade-1.v1.json` and `grade-1.v1.cells.json` together. They must
   stay in step: the first is what the module grades against, the second is
   where each of those slots lives on the sheet.
3. Trim the padded sheets and save the result here. Check the sibling extents
   first — a new file may pad different sheets, or none.
4. Run `MatatagWorkbookExportTest`. It asserts, in both directions, that every
   descriptor lands on its own cell and that no other cell is filled, so a
   layout shift shows up as a failure rather than as a quietly wrong form.

A different grade level is a different template and a different cell map, and
`WorkbookExport` refuses to export a section whose pinned catalog does not
match the bundled map rather than writing Grade 2's marks into Grade 1's
columns.

## Sample data

DepEd's file ships with a learner called `sample`, a row of descriptors, two
Cebuano narratives and a month of attendance figures — all in the first
learner's row, which is the row a real learner then occupies. The export clears
every region it writes before writing, so none of it can reach a school's
submission. `TERM 3 LANGUAGE!K15` is the awkward one: a stray `A` in a column
that is not a slot in any term, which is why the clearing covers the whole
rating region and not just the 604 mapped cells.
