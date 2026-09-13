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

];
