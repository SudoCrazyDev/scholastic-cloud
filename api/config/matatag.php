<?php

/*
|--------------------------------------------------------------------------
| DepEd MATATAG Key Stage 1
|--------------------------------------------------------------------------
|
| The fixed vocabulary of the Key Stage 1 progress report: its three terms,
| the five letter descriptors, and the language macro skills. Small, hand-
| edited reference data, so it lives here rather than in a table — the same
| call `config/modules.php` and `config/features.php` make.
|
| What is NOT here is the competency catalog itself. That is ~200
| competencies and ~600 rating slots per grade level, decoded from a binary
| workbook, and it belongs in `matatag_*` tables loaded from
| `database/data/matatag/*.json`. Putting it here would bake a megabyte of
| curriculum into `php artisan config:cache` and reload it on every request.
|
| Read `docs/modules/MatatagKeyStage1/MATATAG.md` before changing anything in
| this file, especially the `terms` block.
|
*/

return [

    /*
     * The grade levels Key Stage 1 covers. Matched case- and whitespace-
     * insensitively against `class_sections.grade_level`, which is a free
     * string a school types, not a foreign key.
     *
     * Key Stage 2 (Grades 4-6) is a different instrument and is deliberately
     * absent — do not add it here expecting this module to cover it.
     */
    'grade_levels' => ['Grade 1', 'Grade 2', 'Grade 3'],

    /*
     * The three terms, and the months each one owns.
     *
     * DepEd's printed form splits September across Terms 1 and 2, because
     * their boundary falls mid-month. We assign whole months instead, so
     * September sits entirely in Term 1 and the attendance table derives
     * cleanly from the monthly figures the platform already holds.
     *
     * That is a deliberate, documented deviation: `student_attendances`
     * stores one row per learner per month and there is no daily academic
     * register anywhere in the schema, so a mid-month split could only ever
     * be an estimate — and an estimate is not something a school can defend
     * to a parent. See the MATATAG doc, "Attendance".
     *
     * School years run June-May, matching App\Support\AcademicYear.
     */
    'terms' => [
        1 => ['label' => 'Term 1', 'filipino' => 'Unang Termino', 'months' => [6, 7, 8, 9]],
        2 => ['label' => 'Term 2', 'filipino' => 'Ikalawang Termino', 'months' => [10, 11, 12]],
        3 => ['label' => 'Term 3', 'filipino' => 'Ikatlong Termino', 'months' => [1, 2, 3, 4]],
    ],

    /*
     * The five letter descriptors, worded exactly as DepEd prints them on the
     * report card legend.
     *
     * Stored as `char(1)` and validated against these keys — deliberately not
     * a MySQL enum. `core_value_markings.marking` is an enum and would need an
     * ALTER TABLE on a large table the day a descriptor is renamed, which has
     * already happened once during the MATATAG rollout.
     *
     * This wording is served to clients and printed from the payload. Do not
     * copy it into a frontend constant; there should be one source for it.
     */
    'descriptors' => [
        'A' => [
            'label' => 'Advancing',
            'filipino' => 'Namumukod-tangi',
            'description' => 'Consistently demonstrates advanced skills, understanding, and values beyond expectations; applies learning independently, confidently, and with initiative across tasks and situations.',
        ],
        'B' => [
            'label' => 'Benchmarking',
            'filipino' => 'Naipamamalas',
            'description' => 'Demonstrates expected skills, understanding, and values at grade level with consistency; performs tasks accurately and independently in most situations.',
        ],
        'C' => [
            'label' => 'Connecting',
            'filipino' => 'Natutungo',
            'description' => 'Shows developing skills, understanding, and values; able to apply learning in familiar tasks with minimal guidance and support.',
        ],
        'D' => [
            'label' => 'Developing',
            'filipino' => 'Nagpapaunlad',
            'description' => 'Demonstrates emerging skills, understanding, and values; requires regular guidance, practice, and support to improve performance.',
        ],
        'E' => [
            'label' => 'Emerging',
            'filipino' => 'Nagsisimula',
            'description' => 'Beginning to demonstrate basic skills, understanding, and values; requires close supervision, structured support, and targeted intervention.',
        ],
    ],

    /*
     * Language macro skills. Reading & Literacy and Language rate each
     * competency once per macro skill; Mathematics, GMRC and Makabansa rate it
     * once with no macro skill, which is what `none` is for.
     *
     * `fills` is the load-bearing part. The workbook records a slot's macro
     * skill ONLY as the background colour of its cell — there is a printed
     * legend and no machine-readable label anywhere. These ARGB values are how
     * the extractor decodes it, and they live next to the labels so that
     * extracting Grade 2 and Grade 3 from workbooks nobody has seen yet is
     * reproducible. If a future DepEd file uses different shades, add them
     * here; that is a config change, not a code change.
     *
     * A cell filled black or with a theme colour means the competency is not
     * taught that term, and no slot row exists for it at all.
     */
    'macro_skills' => [
        'listening' => [
            'label' => 'Listening',
            'abbr' => 'L',
            'fills' => ['FFFDE49A', 'FFFFE598'],
        ],
        'speaking' => [
            'label' => 'Speaking',
            'abbr' => 'S',
            'fills' => ['FFC9A6E6'],
        ],
        'reading' => [
            'label' => 'Reading',
            'abbr' => 'R',
            'fills' => ['FFFFA766', 'FFF7B083'],
        ],
        'copying_guided_writing' => [
            'label' => 'Copying and Guided Writing in response to Comprehension Questions',
            'abbr' => 'W',
            'fills' => ['FFC4E0B3'],
        ],
        'none' => [
            'label' => null,
            'abbr' => null,
            'fills' => [],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | The official workbook
    |--------------------------------------------------------------------------
    |
    | Where DepEd's own e-class record lives, and the fixed cell addresses the
    | export writes into. Only the *static* geometry is here — the address of
    | each of the 604 descriptor cells is generated data and lives beside the
    | catalog in database/data/matatag/, because it is far too big to cache
    | into every request.
    |
    | These addresses are the template's, not the curriculum's. If DepEd
    | reissues the same competencies on a sheet with an extra column, this
    | block and the cell map change and nothing else does.
    |
    */
    'workbook' => [
        // Relative to resource_path(). A trimmed copy of DepEd's file: four
        // sheets shipped padded to ~1000 empty rows where their own siblings
        // stop at 315/120, which was 43% of the file and most of the memory
        // cost of an export. See resources/matatag/README.md.
        'template' => 'matatag/KEY_STAGE_1_GRADE_1_3_TERM.template.xlsx',

        // Relative to database_path('data'). Generated by extract.py.
        'cell_map' => 'matatag/grade-1.v1.cells.json',

        // DepEd's sheet holds 50 male and 50 female learners, and the female
        // block always starts 51 rows below the male one (50 rows plus the
        // "FEMALE" banner). A section larger than this cannot be printed on
        // DepEd's own form at all; the export says so rather than truncating.
        'capacity' => 50,
        'female_offset' => 51,

        // The first rating column on every class-summary sheet; columns to its
        // left are the learner's name, LRN, birthdate, age and sex. Everything
        // from here rightwards in a learner's row is a descriptor and is
        // cleared before the export writes, because DepEd leaves stray sample
        // marks in columns that are not slots at all (`TERM 3 LANGUAGE!K15`)
        // and an uncleared one would be read as a real mark.
        'first_rating_column' => 11,

        // Everything else on the sheets is a formula reading from here.
        'input_data' => [
            'sheet' => 'INPUT DATA',
            'fields' => [
                'region' => 'F10',
                'division' => 'F11',
                'city' => 'F12',
                'district' => 'F13',
                'school_id' => 'F15',
                'school_name' => 'F16',
                'school_year' => 'F18',
                'school_head' => 'F19',
                'adviser' => 'F26',
                'grade_level' => 'F27',
                'section' => 'F28',
            ],
            'first_row' => 11,
            'male' => ['name' => 'L', 'lrn' => 'M', 'birthdate' => 'N'],
            'female' => ['name' => 'Q', 'lrn' => 'R', 'birthdate' => 'S'],
        ],

        // SF9 pulls both narratives out of these columns by VLOOKUP on name.
        'summary' => [
            'sheets' => [1 => 'TERM 1 SUMMARY', 2 => 'TERM 2 SUMMARY', 3 => 'TERM 3 SUMMARY'],
            'first_row' => 14,
            'can_do' => 'N',
            'to_improve' => 'Q',
        ],

        // Days present per learner-month, and the class days footer the whole
        // sheet divides against.
        'attendance' => [
            'sheet' => 'G1 - ATTENDANCE SUMMARY',
            'first_row' => 13,
            'class_days_row' => 116,
            // Month number => column. DepEd prints September twice, split
            // across Terms 1 and 2 (columns I and J); we count it once, wholly
            // in Term 1, so column I is written and J is left at zero. The
            // deviation is the one documented in TermAttendance.
            'columns' => [
                6 => 'F',  7 => 'G',  8 => 'H',  9 => 'I',
                10 => 'K', 11 => 'L', 12 => 'M',
                1 => 'N',  2 => 'O',  3 => 'P',  4 => 'Q',
            ],
            'september_term_2' => 'J',
        ],

        // DepEd's own bug: the "July" row of SF9's attendance table reuses
        // August's VLOOKUP index, so July prints August's figure. Indices run
        // 4, 6, 6, 7 where they should run 4, 5, 6, 7. Repaired on the way out
        // — a wrong attendance figure on a form handed to a parent is not a
        // defect worth reproducing faithfully.
        'sf9_july_fix' => [
            'sheet' => 'SF9 - GRADE 1',
            'cell' => 'Q26',
            'formula' => "=VLOOKUP(D15,'G1 - ATTENDANCE SUMMARY'!C13:Q113,5,0)",
        ],
    ],

];
