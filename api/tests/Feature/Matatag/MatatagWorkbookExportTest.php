<?php

namespace Tests\Feature\Matatag;

use App\Models\MatatagCompetencyRating;
use App\Models\MatatagCurriculumVersion;
use App\Models\MatatagTermNarrative;
use App\Models\Student;
use App\Models\StudentSection;
use App\Services\Matatag\WorkbookExport;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * DepEd's own workbook, filled in.
 *
 * Loading and saving a seventeen-sheet styled workbook costs seconds and
 * hundreds of megabytes, so these tests run the export as few times as they
 * can and assert everything they can against each file. The cheap guards —
 * capacity, a foreign catalog, access — never reach the writer at all.
 *
 * The test that matters most is the placement one. A descriptor written into
 * the wrong column is not a visible failure: it produces a plausible-looking
 * DepEd form that says something false about a six-year-old, on a sheet where
 * the only thing distinguishing one macro skill from the next is a fill
 * colour. So the export is read back cell by cell and compared against every
 * mark in the database, in both directions.
 */
class MatatagWorkbookExportTest extends MatatagTestCase
{
    /** @var array<int, \PhpOffice\PhpSpreadsheet\Spreadsheet> */
    private array $opened = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->optIn($this->sectionA1);
    }

    /**
     * Hand every workbook back before the next test opens one.
     *
     * A `Spreadsheet` and its worksheets reference each other, so dropping the
     * last variable does not free them - PHPUnit then carries one loaded
     * workbook per test to the end of the class and the run dies somewhere
     * past 768 MB. `disconnectWorksheets()` is PhpSpreadsheet's own answer to
     * this and keeps the file's whole suite inside a normal limit.
     */
    protected function tearDown(): void
    {
        foreach ($this->opened as $book) {
            $book->disconnectWorksheets();
        }

        $this->opened = [];

        parent::tearDown();
    }

    // -----------------------------------------------------------------
    // Placement
    // -----------------------------------------------------------------

    /**
     * Every mark lands on the cell it came off, and nothing else is marked.
     *
     * Checked in both directions: each rating in the database appears at its
     * mapped cell, and the set of filled cells across all nine class-summary
     * sheets is exactly that set. A stray value left behind by the template
     * fails the second half.
     */
    public function test_every_descriptor_lands_on_its_own_cell_and_nothing_else_is_filled(): void
    {
        $cruz = $this->learnerNamed('Cruz');
        $bautista = $this->learnerNamed('Bautista');

        // Two areas, two shapes: Reading & Literacy carries macro skills and one
        // competency list for the year, GMRC carries neither.
        $reading = $this->slotsFor('reading-literacy', 1);
        $gmrc = $this->slotsFor('gmrc', 2);

        $this->mark($cruz, $reading[0], 'A');
        $this->mark($cruz, $reading[1], 'B');
        $this->mark($bautista, $reading[0], 'E');
        $this->mark($cruz, $gmrc[0], 'C');

        $book = $this->export();

        $expected = [];

        foreach ($this->everyMark() as $mark) {
            [$sheet, $column] = $this->cellFor($mark);
            $expected[$sheet.'!'.$column.':'.$this->rowFor($mark->student_id, $mark->area_key)] = $mark->descriptor;
        }

        ksort($expected);

        $this->assertCount(4, $expected, 'the four marks must map to four distinct cells');
        $this->assertSame($expected, $this->filledRatingCells($book));
    }

    /**
     * A learner's row is their place on DepEd's fixed 50-male / 50-female sheet.
     *
     * The roster arrives male-first then by surname, so Cruz is the first male
     * row and Bautista and Dizon are the first two female rows — fifty-one
     * rows below, past the "FEMALE" banner.
     */
    public function test_learners_land_in_the_male_and_female_blocks_in_roster_order(): void
    {
        $this->mark($this->learnerNamed('Dizon'), $this->slotsFor('reading-literacy', 1)[0], 'D');

        $book = $this->export();
        $sheet = $book->getSheetByName('INPUT DATA');

        // Male names in column L, female in Q, both starting at row 11.
        $this->assertSame('Cruz, Ben', $sheet->getCell('L11')->getValue());
        $this->assertNull($sheet->getCell('L12')->getValue());

        $this->assertSame('Bautista, Ana', $sheet->getCell('Q11')->getValue());
        $this->assertSame('Dizon, Cara', $sheet->getCell('Q12')->getValue());
        $this->assertNull($sheet->getCell('Q13')->getValue());

        // And the descriptor sheets use the same split, 51 rows apart. Reading
        // & Literacy learners start on row 15 and Dizon is the second female,
        // so 15 + 51 + 1.
        [$sheetName, $column] = $this->cellFor($this->everyMark()->first());

        $this->assertSame('D', $book->getSheetByName($sheetName)->getCell([$column, 67])->getValue());
    }

    // -----------------------------------------------------------------
    // DepEd's own sample data
    // -----------------------------------------------------------------

    /**
     * None of the template's sample content reaches a school's submission.
     *
     * DepEd ships a learner called "sample", a row of descriptors, two Cebuano
     * narratives and a month of attendance figures. All of it sits in the first
     * learner's row, which is the row a real learner then occupies.
     *
     * `TERM 3 LANGUAGE!K15` is the one that made this test necessary: it is a
     * stray mark in a column that is not a slot in any term, so clearing only
     * the mapped cells left it behind, where it reads as a real descriptor.
     */
    public function test_no_sample_data_from_the_template_survives_the_export(): void
    {
        $book = $this->export();

        $this->assertSame([], $this->filledRatingCells($book), 'no marks were recorded, so no cell may be filled');

        // Row 11 is the sample learner's row and is now the first real male's,
        // so what proves the clearing is the rows past the roster.
        $input = $book->getSheetByName('INPUT DATA');
        $this->assertSame('Cruz, Ben', $input->getCell('L11')->getValue());
        $this->assertNull($input->getCell('M11')->getValue(), "the sample learner's LRN");
        $this->assertNull($input->getCell('L12')->getValue(), 'the row past the last male');
        $this->assertNull($input->getCell('N12')->getValue(), "the sample learner's birthdate");

        $summary = $book->getSheetByName('TERM 1 SUMMARY');
        $this->assertNull($summary->getCell('N14')->getValue(), 'the sample narrative');
        $this->assertNull($summary->getCell('Q14')->getValue(), 'the sample narrative');

        // The template's sample attendance sits on the first female row.
        $attendance = $book->getSheetByName('G1 - ATTENDANCE SUMMARY');
        $this->assertSame(0, $attendance->getCell('F64')->getValue());

        // SF9 is one VLOOKUP on this cell, so DepEd's placeholder would open
        // the card on a wall of #N/A. It names a real learner instead.
        $this->assertSame('Cruz, Ben', $book->getSheetByName('SF9 - GRADE 1')->getCell('D15')->getValue());
    }

    // -----------------------------------------------------------------
    // Narratives, attendance, and DepEd's July bug
    // -----------------------------------------------------------------

    /**
     * The two paragraphs go into the columns SF9 reads them out of.
     */
    public function test_narratives_reach_the_columns_the_report_card_reads(): void
    {
        $cruz = $this->learnerNamed('Cruz');

        MatatagTermNarrative::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA1->id,
            'student_id' => $cruz->id,
            'academic_year' => self::YEAR,
            'term' => 2,
            'can_do' => 'Reads aloud with growing confidence.',
            'to_improve' => 'Needs practice with blends.',
        ]);

        $book = $this->export();

        // Cruz is the first male, so row 14 on the summary sheets.
        $sheet = $book->getSheetByName('TERM 2 SUMMARY');
        $this->assertSame('Reads aloud with growing confidence.', $sheet->getCell('N14')->getValue());
        $this->assertSame('Needs practice with blends.', $sheet->getCell('Q14')->getValue());

        // ...and only into that term's sheet.
        $this->assertNull($book->getSheetByName('TERM 1 SUMMARY')->getCell('N14')->getValue());
        $this->assertNull($book->getSheetByName('TERM 3 SUMMARY')->getCell('N14')->getValue());
    }

    /**
     * DepEd's July row reads August's column. It is repaired on the way out.
     *
     * `SF9!Q26` reuses August's VLOOKUP index, so the indices run 4, 6, 6, 7
     * where they should run 4, 5, 6, 7 and the July row prints August's figure.
     * Shipping that faithfully would put a wrong attendance number on a form a
     * parent is handed.
     */
    public function test_the_attendance_table_reads_its_own_columns_and_counts_september_once(): void
    {
        $book = $this->export();
        $sf9 = $book->getSheetByName('SF9 - GRADE 1');

        $index = fn (string $cell) => (int) (preg_match('/,(\d+),0\)/', (string) $sf9->getCell($cell)->getValue(), $m) ? $m[1] : 0);

        $this->assertSame(
            [4, 5, 6, 7],
            [$index('Q25'), $index('Q26'), $index('Q27'), $index('Q28')],
            'June, July, August and September must each read their own column',
        );

        // September is written once, wholly in Term 1: `student_attendances`
        // holds one row per learner-month and the schema has no daily academic
        // register, so splitting it mid-month could only be an estimate. DepEd's
        // Term 2 September column (J) is therefore zeroed rather than guessed.
        $attendance = $book->getSheetByName('G1 - ATTENDANCE SUMMARY');
        $this->assertSame(0, $attendance->getCell('J116')->getValue(), "Term 2's September column");
        $this->assertSame(0, $attendance->getCell('J13')->getValue(), "the first learner's Term 2 September");
    }

    // -----------------------------------------------------------------
    // Guards that never reach the writer
    // -----------------------------------------------------------------

    /**
     * A section too big for DepEd's form is refused, not truncated.
     *
     * The sheet holds fifty of each sex. A file that silently dropped the
     * fifty-first learner would be worse than no file: it looks complete.
     */
    public function test_a_section_larger_than_depeds_form_is_refused_rather_than_truncated(): void
    {
        for ($i = 0; $i < 50; $i++) {
            $this->makeLearner($this->schoolA, $this->sectionA1, "Boy{$i}", "Surname{$i}", 'male');
        }

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/workbook?class_section_id={$this->sectionA1->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'workbook_not_exportable');
    }

    /**
     * A section pinned to a catalog this template was not built from is refused.
     *
     * Grade 2 will arrive as its own competencies on its own sheet; mapping
     * them through Grade 1's column addresses would put marks in the wrong
     * columns silently, on a form a division office receives.
     */
    public function test_a_section_on_another_catalog_is_refused(): void
    {
        $other = MatatagCurriculumVersion::create([
            'code' => 'deped-matatag-ks1-grade-2-v1',
            'title' => 'DepEd MATATAG Key Stage 1 - Grade 2',
            'grade_level' => 'Grade 2',
        ]);

        $this->optIn($this->sectionA1, $other);

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/workbook?class_section_id={$this->sectionA1->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'workbook_not_exportable');
    }

    /**
     * A section that has not opted in has no catalog to export against.
     */
    public function test_a_section_that_has_not_opted_in_is_refused(): void
    {
        $this->as($this->adviserA2)
            ->getJson("/api/matatag/workbook?class_section_id={$this->sectionA2->id}")
            ->assertStatus(409);
    }

    // -----------------------------------------------------------------
    // Printing is reading
    // -----------------------------------------------------------------

    /**
     * Exporting changes nothing. It is a read, and the ability that guards it
     * is `view`.
     */
    public function test_exporting_writes_nothing(): void
    {
        $this->mark($this->learnerNamed('Cruz'), $this->slotsFor('gmrc', 1)[0], 'B');

        $before = [
            'ratings' => MatatagCompetencyRating::get()->toArray(),
            'narratives' => MatatagTermNarrative::get()->toArray(),
            'attendance' => DB::table('student_attendances')->get()->toArray(),
            'school_days' => DB::table('school_days')->get()->toArray(),
            'sections' => DB::table('matatag_section_curricula')->get()->toArray(),
        ];

        $this->export();

        // assertEquals, not assertSame: the query builder hands back fresh
        // stdClass instances every call, so identity comparison would fail on
        // rows that are byte-for-byte the same.
        $this->assertEquals($before, [
            'ratings' => MatatagCompetencyRating::get()->toArray(),
            'narratives' => MatatagTermNarrative::get()->toArray(),
            'attendance' => DB::table('student_attendances')->get()->toArray(),
            'school_days' => DB::table('school_days')->get()->toArray(),
            'sections' => DB::table('matatag_section_curricula')->get()->toArray(),
        ]);
    }

    /**
     * The download arrives as a spreadsheet, named for the section and year.
     */
    public function test_the_route_returns_a_named_spreadsheet(): void
    {
        $response = $this->as($this->adviserA1)
            ->get("/api/matatag/workbook?class_section_id={$this->sectionA1->id}");

        $response->assertOk();

        $this->assertSame(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            $response->headers->get('content-type'),
        );

        $this->assertStringContainsString(
            'MATATAG ECR - Sampaguita - '.self::YEAR.'.xlsx',
            (string) $response->headers->get('content-disposition'),
        );
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    /**
     * Run the export and load what it wrote.
     *
     * Goes through the service rather than the route so a test can read cells
     * without a round trip through a streamed download.
     */
    private function export(): \PhpOffice\PhpSpreadsheet\Spreadsheet
    {
        $section = $this->sectionA1->fresh();

        $path = app(WorkbookExport::class)->forSection(
            $section,
            \App\Models\MatatagSectionCurriculum::where('class_section_id', $section->id)
                ->where('academic_year', self::YEAR)
                ->firstOrFail(),
            self::YEAR,
            $this->roster(),
        );

        $book = IOFactory::load($path);
        @unlink($path);

        $this->opened[] = $book;

        return $book;
    }

    /**
     * The roster in the order the controller passes it: male first, then by
     * surname. Mirrors `ResolvesMatatagSection::sectionRoster()`.
     */
    private function roster()
    {
        return StudentSection::query()
            ->join('students', 'students.id', '=', 'student_sections.student_id')
            ->where('student_sections.section_id', $this->sectionA1->id)
            ->where('student_sections.academic_year', self::YEAR)
            ->where('student_sections.is_active', true)
            ->orderByRaw("CASE WHEN LOWER(students.gender) = 'male' THEN 0 ELSE 1 END")
            ->orderBy('students.last_name')
            ->orderBy('students.first_name')
            ->select([
                'students.id', 'students.lrn', 'students.first_name', 'students.middle_name',
                'students.last_name', 'students.ext_name', 'students.gender', 'students.birthdate',
            ])
            ->get();
    }

    private function learnerNamed(string $lastName): Student
    {
        foreach ($this->learnersA1 as $learner) {
            if ($learner->last_name === $lastName) {
                return $learner;
            }
        }

        $this->fail("no learner named {$lastName} in the fixture");
    }

    private function mark(Student $student, \App\Models\MatatagCompetencySlot $slot, string $descriptor): void
    {
        MatatagCompetencyRating::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA1->id,
            'student_id' => $student->id,
            'academic_year' => self::YEAR,
            'slot_id' => $slot->id,
            'term' => $slot->term,
            'learning_area_id' => $slot->learning_area_id,
            'curriculum_version_id' => $this->catalog()->id,
            'descriptor' => $descriptor,
        ]);
    }

    /** Every mark in the fixture, with what the cell map needs to place it. */
    private function everyMark()
    {
        return DB::table('matatag_competency_ratings as r')
            ->join('matatag_competency_slots as s', 's.id', '=', 'r.slot_id')
            ->join('matatag_competencies as c', 'c.id', '=', 's.competency_id')
            ->join('matatag_learning_areas as a', 'a.id', '=', 's.learning_area_id')
            ->get(['r.student_id', 'r.descriptor', 'c.path', 's.term', 's.macro_skill', 'a.key as area_key']);
    }

    private function cellMap(): array
    {
        return json_decode(
            (string) file_get_contents(database_path('data/'.config('matatag.workbook.cell_map'))),
            true,
        );
    }

    /** @return array{0: string, 1: int} */
    private function cellFor(object $mark): array
    {
        $slots = $this->cellMap()['areas'][$mark->area_key]['slots'];

        return $slots["{$mark->path}|{$mark->term}|{$mark->macro_skill}"];
    }

    private function rowFor(string $studentId, string $areaKey): int
    {
        $first = (int) $this->cellMap()['areas'][$areaKey]['learner_row'];
        $offset = (int) config('matatag.workbook.female_offset');

        $males = 0;
        $females = 0;

        foreach ($this->roster() as $student) {
            $index = strtolower((string) $student->gender) === 'male'
                ? $males++
                : $offset + $females++;

            if ($student->id === $studentId) {
                return $first + $index;
            }
        }

        $this->fail('student not on the roster');
    }

    /**
     * Every filled cell in the learner blocks of all nine class-summary sheets,
     * as "SHEET!col:row" => descriptor.
     *
     * The second half of the placement assertion: anything here that the
     * database did not put there is a leak from DepEd's template.
     *
     * @return array<string, mixed>
     */
    private function filledRatingCells(\PhpOffice\PhpSpreadsheet\Spreadsheet $book): array
    {
        $firstColumn = (int) config('matatag.workbook.first_rating_column');
        $capacity = (int) config('matatag.workbook.capacity');
        $offset = (int) config('matatag.workbook.female_offset');

        $out = [];

        foreach ($this->cellMap()['areas'] as $area) {
            $first = (int) $area['learner_row'];
            $last = $first + $offset + $capacity - 1;

            foreach (array_unique(array_column($area['slots'], 0)) as $sheetName) {
                $sheet = $book->getSheetByName($sheetName);
                $highest = min($last, $sheet->getHighestRow());

                if ($highest < $first) {
                    continue;
                }

                // Only cells the sheet actually holds: walking the full grid
                // with getCell() would instantiate ninety thousand empty ones.
                foreach ($sheet->getRowIterator($first, $highest) as $row) {
                    $cells = $row->getCellIterator();
                    $cells->setIterateOnlyExistingCells(true);

                    foreach ($cells as $cell) {
                        $column = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString($cell->getColumn());
                        $value = $cell->getValue();

                        if ($column >= $firstColumn && $value !== null && $value !== '') {
                            $out[$sheetName.'!'.$column.':'.$row->getRowIndex()] = $value;
                        }
                    }
                }
            }
        }

        ksort($out);

        return $out;
    }
}
