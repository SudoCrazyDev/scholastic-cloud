<?php

namespace App\Services\Matatag;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\MatatagSectionCurriculum;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use RuntimeException;

/**
 * DepEd's own e-class record, filled in.
 *
 * This is the school's *submission* artifact. The PDFs are what a parent is
 * handed; this is the file a division office asks for, and it has to be
 * DepEd's file - same sheets, same formulas, same colours - not our rendering
 * of it.
 *
 * ## Why a template fill, and not a build
 *
 * The macro-skill encoding on the class-summary sheets *is* fill colour, and
 * `PACE - GRADE 1` and `SF9 - GRADE 1` are formula sheets that compute
 * themselves from the summary sheets. A rebuilt workbook would have to
 * reproduce every fill, merge, print area and formula by hand and would drift
 * from DepEd's the first time they touch it. (The JS route was ruled out on
 * harder grounds: `xlsx@0.18.5`, the community build already in this repo,
 * silently drops `fill` and `font` on write - a round-trip returns
 * `patternType: 'none'`, which erases exactly the thing that makes the form
 * legible.)
 *
 * So: load DepEd's file, write only value cells, save. Every fill, merge,
 * print setting and formula is already correct, and PACE and SF9 populate
 * themselves when Excel opens the file.
 *
 * ## What gets written, and nothing else
 *
 * `INPUT DATA` (school, adviser, section, roster) and the per-area
 * class-summary sheets (descriptors), plus the two narrative columns and the
 * attendance figures that SF9 reads by VLOOKUP. Everything on SF9 and PACE is
 * a formula and is left strictly alone.
 *
 * Formulas are **not** pre-calculated on save. PhpSpreadsheet would have to
 * evaluate a DATEDIF/VLOOKUP chain across seventeen sheets, which is slow and
 * fails on functions it does not implement; Excel recalculates on open, which
 * is what the file is for.
 *
 * ## Cost
 *
 * Roughly 8 seconds and ~200 MB for one section, almost all of it in
 * PhpSpreadsheet's load and save of a 17-sheet styled workbook - the fill
 * itself is a few thousand cell writes. That is why the committed template is
 * trimmed (see resources/matatag/README.md) and why the controller raises the
 * memory limit for the request. It is a once-a-term submission, not an
 * interactive screen, so a download that takes a few seconds is the right
 * trade against a queue, a job table and a polling UI.
 */
class WorkbookExport
{
    /**
     * PhpSpreadsheet's hard requirements that a bare PHP build may not carry.
     *
     * Checked rather than assumed because the servers do not run composer -
     * the deploy ships a prebuilt `vendor/`, so a missing extension surfaces
     * here at runtime rather than at install time.
     */
    private const REQUIRED_EXTENSIONS = ['zip', 'gd', 'simplexml', 'xmlwriter'];

    public function __construct(private readonly TermAttendance $attendance) {}

    /**
     * Why this export cannot run here, or null if it can.
     */
    public function unavailableReason(): ?string
    {
        foreach (self::REQUIRED_EXTENSIONS as $extension) {
            if (! extension_loaded($extension)) {
                return "This server's PHP is missing the \"{$extension}\" extension, which is "
                    .'required to write an Excel file. The PDF report card and PACE forms '
                    .'are unaffected.';
            }
        }

        if (! is_file($this->templatePath())) {
            return 'The DepEd workbook template is missing from this installation.';
        }

        if (! is_file($this->cellMapPath())) {
            return 'The workbook cell map is missing from this installation.';
        }

        return null;
    }

    /**
     * Fill DepEd's workbook for one section and return the path it was written to.
     *
     * The caller owns the returned file and is responsible for deleting it.
     *
     * @param  Collection<int, object>  $roster  already scoped, from ResolvesMatatagSection
     */
    public function forSection(
        ClassSection $section,
        MatatagSectionCurriculum $pin,
        string $academicYear,
        Collection $roster,
    ): string {
        if ($reason = $this->unavailableReason()) {
            throw new RuntimeException($reason);
        }

        $map = $this->cellMap($pin);
        $rows = $this->rowIndexes($roster);

        $book = IOFactory::load($this->templatePath());

        $this->writeInputData($book, $section, $academicYear, $roster, $rows);
        $this->writeDescriptors($book, $section, $academicYear, $roster, $rows, $map);
        $this->writeNarratives($book, $section, $academicYear, $roster, $rows);
        $this->writeAttendance($book, $section, $academicYear, $roster, $rows);
        $this->repairSf9JulyRow($book);
        $this->pointSf9At($book, $roster);

        $path = tempnam(sys_get_temp_dir(), 'matatag-');

        $writer = new XlsxWriter($book);
        // Excel recalculates on open; see the class docblock.
        $writer->setPreCalculateFormulas(false);
        $writer->save($path);

        // A 17-sheet styled workbook is the bulk of this request's memory.
        // Releasing it before the response streams keeps the peak to one copy.
        $book->disconnectWorksheets();
        unset($book, $writer);

        return $path;
    }

    /**
     * "MATATAG ECR - Sampaguita - 2026-2027.xlsx"
     */
    public function filenameFor(ClassSection $section, string $academicYear): string
    {
        $title = preg_replace('#[\\\\/:*?"<>|]#', '-', (string) $section->title);

        return trim("MATATAG ECR - {$title} - {$academicYear}").'.xlsx';
    }

    /**
     * Where each learner's figures go, as an offset from a sheet's first row.
     *
     * DepEd's sheets are a fixed 50 male rows, a "FEMALE" banner, then 50
     * female rows - the same shape on all fourteen of them, differing only in
     * which row the block starts on. So the split is computed once here and
     * each sheet adds its own origin.
     *
     * The roster arrives already ordered male-first then by surname, which is
     * the order the form is printed in, so position in the roster *is* the
     * position on the sheet.
     *
     * @param  Collection<int, object>  $roster
     * @return array<string, int> student id => offset from a sheet's first row
     */
    private function rowIndexes(Collection $roster): array
    {
        $capacity = (int) config('matatag.workbook.capacity');
        $offset = (int) config('matatag.workbook.female_offset');

        $males = 0;
        $females = 0;
        $out = [];

        foreach ($roster as $student) {
            if ($this->isMale($student)) {
                $out[$student->id] = $males;
                $males++;
            } else {
                $out[$student->id] = $offset + $females;
                $females++;
            }
        }

        if ($males > $capacity || $females > $capacity) {
            throw new RuntimeException(
                "DepEd's workbook holds {$capacity} male and {$capacity} female learners per "
                ."section; this one has {$males} and {$females}. The form cannot represent it, "
                .'so nothing was exported rather than a file with learners silently missing.'
            );
        }

        return $out;
    }

    private function isMale(object $student): bool
    {
        return strtolower((string) ($student->gender ?? '')) === 'male';
    }

    /**
     * School, adviser and roster. Every other sheet reads these by formula.
     */
    private function writeInputData(
        Spreadsheet $book,
        ClassSection $section,
        string $academicYear,
        Collection $roster,
        array $rows,
    ): void {
        $config = config('matatag.workbook.input_data');
        $sheet = $book->getSheetByName($config['sheet']);
        $institution = Institution::find($section->institution_id);

        $values = [
            'region' => $institution?->region,
            'division' => $institution?->division,
            'school_id' => $institution?->gov_id,
            'school_name' => $institution?->title,
            'school_year' => $academicYear,
            'adviser' => $this->adviserName($section),
            'grade_level' => $this->gradeNumber($section->grade_level),
            'section' => $section->title,
        ];

        foreach ($config['fields'] as $field => $cell) {
            // city, district and school head have no column on `institutions`.
            // They are left blank for the school to complete rather than
            // guessed at, and the template's own label stays visible.
            if (array_key_exists($field, $values) && $values[$field] !== null) {
                $sheet->setCellValue($cell, $values[$field]);
            }
        }

        $first = (int) $config['first_row'];
        $capacity = (int) config('matatag.workbook.capacity');
        $offset = (int) config('matatag.workbook.female_offset');

        // The template ships with one sample learner. Clearing the whole block
        // rather than that one row means no sample data can reach a school's
        // submission however DepEd revises the file.
        foreach (['male', 'female'] as $sex) {
            foreach ($config[$sex] as $column) {
                for ($i = 0; $i < $capacity; $i++) {
                    $sheet->setCellValue($column.($first + $i), null);
                }
            }
        }

        foreach ($roster as $student) {
            $index = $rows[$student->id];
            $columns = $index >= $offset ? $config['female'] : $config['male'];
            $row = $first + ($index >= $offset ? $index - $offset : $index);

            $sheet->setCellValue($columns['name'].$row, $this->learnerName($student));
            $sheet->setCellValue($columns['lrn'].$row, (string) ($student->lrn ?? ''));
            $sheet->setCellValue($columns['birthdate'].$row, $this->dateOnly($student->birthdate));
        }
    }

    /**
     * The descriptors, onto the class-summary sheet each one came off.
     *
     * A slot's cell address is not in the database - it is a property of the
     * template, so it lives in the generated cell map beside the catalog. The
     * join below rebuilds the map's key, `path|term|macro_skill`, for every
     * mark the section holds.
     */
    private function writeDescriptors(
        Spreadsheet $book,
        ClassSection $section,
        string $academicYear,
        Collection $roster,
        array $rows,
        array $map,
    ): void {
        $this->clearRatingCells($book, $map);

        if ($roster->isEmpty()) {
            return;
        }

        $marks = DB::table('matatag_competency_ratings as r')
            ->join('matatag_competency_slots as s', 's.id', '=', 'r.slot_id')
            ->join('matatag_competencies as c', 'c.id', '=', 's.competency_id')
            ->join('matatag_learning_areas as a', 'a.id', '=', 's.learning_area_id')
            ->where('r.institution_id', $section->institution_id)
            ->where('r.academic_year', $academicYear)
            ->whereIn('r.student_id', $roster->pluck('id'))
            ->get(['r.student_id', 'r.descriptor', 'c.path', 's.term', 's.macro_skill', 'a.key as area_key']);

        foreach ($marks as $mark) {
            $area = $map['areas'][$mark->area_key] ?? null;
            if ($area === null) {
                continue;
            }

            $cell = $area['slots']["{$mark->path}|{$mark->term}|{$mark->macro_skill}"] ?? null;
            if ($cell === null) {
                continue;
            }

            [$sheetName, $column] = $cell;
            $row = (int) $area['learner_row'] + $rows[$mark->student_id];

            $book->getSheetByName($sheetName)?->setCellValue([$column, $row], $mark->descriptor);
        }
    }

    /**
     * Empty every rating cell that currently holds one.
     *
     * DepEd ships sample descriptors in the first learner's row, and a learner
     * with no mark against that slot would otherwise inherit one.
     *
     * **The whole rating region is cleared, not just the mapped columns.**
     * `TERM 3 LANGUAGE!K15` and `K66` carry a stray `A` in a column that is not
     * a slot on any term, so clearing only the 604 known cells left it behind —
     * where a teacher reading the exported form would take it for a real mark.
     * Anything from the first rating column rightwards in a learner's row is a
     * descriptor by definition, so all of it goes.
     *
     * Only cells that actually exist in the sheet are visited: writing a null
     * into every column of all 100 rows would create tens of thousands of empty
     * cells and inflate both the export and the file.
     */
    private function clearRatingCells(Spreadsheet $book, array $map): void
    {
        $capacity = (int) config('matatag.workbook.capacity');
        $offset = (int) config('matatag.workbook.female_offset');
        $firstColumn = (int) config('matatag.workbook.first_rating_column');

        foreach ($map['areas'] as $area) {
            $first = (int) $area['learner_row'];
            $last = $first + $offset + $capacity - 1;

            foreach (array_unique(array_column($area['slots'], 0)) as $sheetName) {
                $sheet = $book->getSheetByName($sheetName);

                if ($sheet === null) {
                    continue;
                }

                $this->clearExistingValues(
                    $sheet,
                    $first,
                    $last,
                    range($firstColumn, max($firstColumn, Coordinate::columnIndexFromString($sheet->getHighestColumn()))),
                );
            }
        }
    }

    /**
     * Null out any non-formula value in the given columns of a row range,
     * visiting only cells the sheet actually holds.
     *
     * @param  array<int, int>  $columns  column indexes, 1-based
     */
    private function clearExistingValues(Worksheet $sheet, int $first, int $last, array $columns): void
    {
        $wanted = array_flip($columns);
        $highest = min($last, $sheet->getHighestRow());

        if ($highest < $first) {
            return;
        }

        foreach ($sheet->getRowIterator($first, $highest) as $row) {
            $cells = $row->getCellIterator();
            $cells->setIterateOnlyExistingCells(true);

            foreach ($cells as $cell) {
                if (! isset($wanted[Coordinate::columnIndexFromString($cell->getColumn())])) {
                    continue;
                }

                $value = $cell->getValue();

                if ($value !== null && ! (is_string($value) && str_starts_with($value, '='))) {
                    $cell->setValue(null);
                }
            }
        }
    }

    /**
     * The two paragraphs per term, into the columns SF9 looks them up in.
     */
    private function writeNarratives(
        Spreadsheet $book,
        ClassSection $section,
        string $academicYear,
        Collection $roster,
        array $rows,
    ): void {
        $config = config('matatag.workbook.summary');
        $first = (int) $config['first_row'];
        $capacity = (int) config('matatag.workbook.capacity');
        $offset = (int) config('matatag.workbook.female_offset');
        $last = $first + $offset + $capacity - 1;

        $columns = [
            $this->columnIndex($config['can_do']),
            $this->columnIndex($config['to_improve']),
        ];

        foreach ($config['sheets'] as $sheetName) {
            $sheet = $book->getSheetByName($sheetName);

            // DepEd's sample narratives sit in the first learner's row.
            if ($sheet !== null) {
                $this->clearExistingValues($sheet, $first, $last, $columns);
            }
        }

        if ($roster->isEmpty()) {
            return;
        }

        $written = DB::table('matatag_term_narratives')
            ->where('institution_id', $section->institution_id)
            ->where('academic_year', $academicYear)
            ->whereIn('student_id', $roster->pluck('id'))
            ->get(['student_id', 'term', 'can_do', 'to_improve']);

        foreach ($written as $note) {
            $sheetName = $config['sheets'][(int) $note->term] ?? null;

            if ($sheetName === null || ! isset($rows[$note->student_id])) {
                continue;
            }

            $row = $first + $rows[$note->student_id];
            $sheet = $book->getSheetByName($sheetName);

            $sheet?->setCellValue($config['can_do'].$row, $note->can_do);
            $sheet?->setCellValue($config['to_improve'].$row, $note->to_improve);
        }
    }

    /**
     * Days present per learner-month, and the class-days footer.
     *
     * Derived, never typed - the same `TermAttendance` the report card uses, so
     * the workbook and the printed card cannot disagree. September is written
     * to its Term 1 column only; DepEd's Term 2 September column is left at
     * zero, which is the deviation `TermAttendance` documents.
     */
    private function writeAttendance(
        Spreadsheet $book,
        ClassSection $section,
        string $academicYear,
        Collection $roster,
        array $rows,
    ): void {
        $config = config('matatag.workbook.attendance');
        $sheet = $book->getSheetByName($config['sheet']);

        if ($sheet === null) {
            return;
        }

        $first = (int) $config['first_row'];
        $capacity = (int) config('matatag.workbook.capacity');
        $offset = (int) config('matatag.workbook.female_offset');
        $daysRow = (int) $config['class_days_row'];
        $columns = $config['columns'];
        $septemberTwo = $config['september_term_2'];

        $this->clearExistingValues(
            $sheet,
            $first,
            $first + $offset + $capacity - 1,
            array_map(
                fn ($column) => $this->columnIndex($column),
                array_merge(array_values($columns), [$septemberTwo]),
            ),
        );

        $derived = $this->attendance->forSection($section, $academicYear, $roster);

        foreach ($derived['months'] as $month) {
            $column = $columns[(int) $month['month']] ?? null;

            if ($column !== null) {
                $sheet->setCellValue($column.$daysRow, (int) $month['class_days']);
            }
        }

        // Our September belongs wholly to Term 1, so DepEd's Term 2 September
        // column is zeroed rather than left holding the template's sample.
        $sheet->setCellValue($septemberTwo.$daysRow, 0);

        foreach ($derived['learners'] as $learner) {
            if (! isset($rows[$learner['student_id']])) {
                continue;
            }

            $row = $first + $rows[$learner['student_id']];

            foreach ($learner['months'] as $month) {
                $column = $columns[(int) $month['month']] ?? null;

                if ($column !== null) {
                    $sheet->setCellValue($column.$row, (int) $month['days_present']);
                }
            }

            $sheet->setCellValue($septemberTwo.$row, 0);
        }
    }

    /**
     * Repair DepEd's July attendance formula on the way out.
     *
     * `SF9!Q26` reuses August's VLOOKUP index, so the July row prints August's
     * figure. Shipping that faithfully would put a wrong attendance number on
     * a form a parent is handed, which is not fidelity worth having.
     */
    private function repairSf9JulyRow(Spreadsheet $book): void
    {
        $fix = config('matatag.workbook.sf9_july_fix');

        $book->getSheetByName($fix['sheet'])?->setCellValue($fix['cell'], $fix['formula']);
    }

    /**
     * Point SF9 at a real learner instead of the template's "sample".
     *
     * The whole card is a VLOOKUP on this one cell, so leaving DepEd's
     * placeholder there opens the file on a wall of #N/A.
     *
     * @param  Collection<int, object>  $roster
     */
    private function pointSf9At(Spreadsheet $book, Collection $roster): void
    {
        $sheet = $book->getSheetByName(config('matatag.workbook.sf9_july_fix.sheet'));
        $first = $roster->first();

        $sheet?->setCellValue('D15', $first ? $this->learnerName($first) : null);
    }

    /**
     * The cell map for the version this section is pinned to.
     */
    private function cellMap(MatatagSectionCurriculum $pin): array
    {
        $map = json_decode((string) file_get_contents($this->cellMapPath()), true);

        if (! is_array($map) || ! isset($map['areas'])) {
            throw new RuntimeException('The workbook cell map could not be read.');
        }

        $code = $pin->curriculumVersion?->code;

        // A section pinned to a catalog this template was not built from would
        // map competencies onto the wrong columns - silently, and onto a form a
        // division office receives. Grade 2 and Grade 3 arrive as their own
        // template and their own map.
        if ($code !== null && $code !== $map['version_code']) {
            throw new RuntimeException(
                "This section follows the \"{$code}\" catalog, and the only DepEd workbook "
                ."bundled here is \"{$map['version_code']}\". Exporting would put its marks in "
                .'the wrong columns, so nothing was exported.'
            );
        }

        return $map;
    }

    private function templatePath(): string
    {
        return resource_path((string) config('matatag.workbook.template'));
    }

    private function cellMapPath(): string
    {
        return database_path('data/'.(string) config('matatag.workbook.cell_map'));
    }

    /**
     * Last Name, First Name Ext. M.I. - the order DepEd prints, and the order
     * SF9's VLOOKUP key has to match exactly.
     */
    private function learnerName(object $student): string
    {
        $middle = trim((string) ($student->middle_name ?? ''));

        $tail = array_filter([
            trim((string) ($student->first_name ?? '')),
            trim((string) ($student->ext_name ?? '')),
            $middle === '' ? '' : mb_substr($middle, 0, 1).'.',
        ]);

        $last = trim((string) ($student->last_name ?? ''));
        $rest = implode(' ', $tail);

        return $last === '' ? $rest : trim($last.', '.$rest, ', ');
    }

    private function adviserName(ClassSection $section): ?string
    {
        $adviser = $section->adviser ? User::find($section->adviser) : null;

        if ($adviser === null) {
            return null;
        }

        return trim(implode(' ', array_filter([
            $adviser->first_name,
            $adviser->middle_name,
            $adviser->last_name,
            $adviser->ext_name,
        ]))) ?: null;
    }

    /** 'Grade 1' => 1, which is what the sheet's own validation accepts. */
    private function gradeNumber(?string $gradeLevel): ?int
    {
        return preg_match('/(\d+)/', (string) $gradeLevel, $match) ? (int) $match[1] : null;
    }

    /**
     * A birthdate as a plain Y-m-d string.
     *
     * The API runs in UTC while the schools are in Asia/Manila, so a datetime
     * cast to a spreadsheet serial can land a day early. The column is a date
     * and nothing computes against the time, so the string is the safe form.
     */
    private function dateOnly(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return substr((string) $value, 0, 10);
    }

    private function columnIndex(string $column): int
    {
        return Coordinate::columnIndexFromString($column);
    }
}
