<?php

namespace App\Support;

/**
 * What a full institution clean-up deletes, and what it deliberately leaves.
 *
 * A school that has finished a pilot, been keyed in twice, or is being handed
 * over to a new set of staff needs its slate wiped without losing the people on
 * it. This class is the single source of truth for that operation: the groups
 * the screen offers, the tables behind each one in delete order, how each table
 * is narrowed to one tenant, and the records that are never in scope at all.
 *
 * ## The promise
 *
 * **Students and staff survive; everything they did does not.** After a clean-up
 * of every group the institution still has its students — with their profiles,
 * guardians, emergency contacts, health records, documents, RFID tags and portal
 * logins intact — and its staff, with their logins, institution membership, role
 * and personal-information records. What goes is the school built around them:
 * sections, subjects, grades, assessments, attendance, money, payroll,
 * announcements, chat, SMS and devices.
 *
 * A student therefore stays *enrolled* (`student_institutions` is kept) but ends
 * up *unassigned* — their section and subject rows go with the sections and
 * subjects themselves. That is the intended end state: a real roster of people,
 * ready to be organised again from scratch.
 *
 * ## Why this is not FinanceDataGroups with more rows
 *
 * The Finance clear is scoped to one academic year. This is not scoped to a year
 * at all — it empties the institution across every year it has ever had, because
 * "start this school again" has no meaning restricted to a year. That makes it
 * strictly more destructive, which is why it is super-administrator-only and
 * platform-only rather than something a school can reach.
 *
 * ## How tables are narrowed to one tenant
 *
 * Most tables carry `institution_id`. Many do not, and for those the wrong
 * narrowing is a cross-tenant data loss rather than a bug that shows up in
 * tests: a student enrolled at two schools on this platform must not lose the
 * other school's grades because this one was cleaned. So every table without its
 * own `institution_id` is scoped **through a parent that has one** — grades
 * through their subject, attendance through its section, assessment answers
 * through the attempt, the item, the ECR and the subject above it. See
 * {@see scoping()}.
 *
 * Exactly one table cannot be reached that way, `core_value_markings`, which
 * carries only `student_id` and `academic_year`. It is scoped through enrolment
 * instead and is called out on screen for that reason.
 *
 * ## Delete order
 *
 * `tables` is in delete order — a child before the parent it points at. Almost
 * every foreign key in this schema is CASCADE or SET NULL, so a wrong order
 * mostly would not *fail*; it would quietly succeed and take something with it.
 * The one hard stop is `student_assessment_answers.question_id`, which is
 * RESTRICT, so answers must be deleted before the questions they answer.
 */
class InstitutionCleanupGroups
{
    /**
     * The groups a clean-up may run, in the order they are deleted.
     *
     * Order across groups matters as much as order within one: `structure` is
     * last because sections, subjects and grading scales are what most of the
     * earlier groups are scoped *through*. Deleting a subject first would strand
     * its grades outside the reach of the query meant to delete them.
     *
     * @return array<string, array{
     *     label: string,
     *     area: string,
     *     description: string,
     *     tables: array<string>,
     *     soft_deletes: array<string>,
     * }>
     */
    public static function all(): array
    {
        return [
            'assessments' => [
                'label' => 'Grades, ECR & Assessments',
                'area' => 'Academics',
                'description' => 'Running grades, ECR items and scores, online assessments with every student attempt and answer, summative assessments and core-value markings.',
                'tables' => [
                    // Answers first: question_id is the one RESTRICT foreign key
                    // in the schema, so the questions cannot go before these.
                    'student_assessment_answers',
                    'student_assessment_attempts',
                    'assessment_questions',
                    'student_ecr_item_scores',
                    'subject_ecr_items',
                    'subjects_ecr',
                    'subject_summative_assessments',
                    'student_running_grades',
                    'core_value_markings',
                ],
                // Both are soft-deleting models. A trashed running grade still
                // occupies its slot and would reappear in a recalculation, so
                // the clear has to take the trashed rows too.
                'soft_deletes' => ['assessment_questions', 'student_running_grades'],
            ],

            'lessons' => [
                'label' => 'Lesson Plans & Topics',
                'area' => 'Academics',
                'description' => 'Quarter plans, topics, lesson plans (including AI-generated ones), student lesson progress and queued AI generation tasks.',
                'tables' => [
                    'student_lesson_progress',
                    'lesson_plans',
                    'topics',
                    'subject_quarter_plans',
                    'ai_generation_tasks',
                ],
                'soft_deletes' => [],
            ],

            'attendance' => [
                'label' => 'Student Attendance & School Days',
                'area' => 'Academics',
                'description' => 'Monthly attendance recorded per section, and the school-day totals attendance is computed against.',
                'tables' => [
                    'student_attendances',
                    'school_days',
                ],
                'soft_deletes' => [],
            ],

            'assignments' => [
                'label' => 'Section & Subject Assignments',
                'area' => 'Academics',
                'description' => 'Which section each student sits in and which subjects they take. Enrolment in the school itself is kept — students remain on the roster, just unassigned.',
                'tables' => [
                    'student_sections',
                    'student_subjects',
                ],
                'soft_deletes' => [],
            ],

            'admissions' => [
                'label' => 'Admission Submissions',
                'area' => 'Academics',
                'description' => 'Applications submitted through the public admission form, including those already converted to students. The students themselves are kept.',
                'tables' => ['admission_form_submissions'],
                'soft_deletes' => [],
            ],

            'finance' => [
                'label' => 'Finance',
                'area' => 'Finance',
                'description' => 'Every receipt, payment line, void request, discount, charge, fee type and amount, payment plan, sibling group, receipt template and disbursement — for every academic year, not just one.',
                'tables' => [
                    'payment_receipt_submissions',
                    'payment_void_requests',
                    'student_online_payment_transactions',
                    'student_payments',
                    'payment_transactions',
                    'student_additional_fees',
                    'grade_level_discount_student_voids',
                    'student_discounts',
                    'grade_level_discounts',
                    'student_payment_plan_changes',
                    'student_payment_plans',
                    'payment_plan_installments',
                    'payment_plans',
                    'school_fee_defaults',
                    'school_fees',
                    'student_fees',
                    'default_discounts',
                    'sibling_group_members',
                    'sibling_groups',
                    'receipt_templates',
                    'fee_naming_runs',
                    'disbursement_receipts',
                    'disbursements',
                    'disbursement_types',
                    'disbursement_component_types',
                ],
                // Waiving a late fee soft-deletes it, and the waived row still
                // holds the unique-index slot that stops it being re-charged.
                'soft_deletes' => ['student_additional_fees'],
            ],

            'hris' => [
                'label' => 'HRIS & Payroll',
                'area' => 'People',
                'description' => 'Payslips and their day and deduction breakdowns, payroll periods, compensations, deduction types, staff loans, staff schedules, attendance exception requests and the staff calendar. Staff logins, roles and personal information are kept.',
                'tables' => [
                    // payslip_deductions points at staff_loan_installments, and
                    // installments point at payslips; deductions therefore go
                    // first and installments before the payslips.
                    'payslip_deductions',
                    'payslip_days',
                    'staff_loan_installments',
                    'staff_loan_events',
                    'staff_loans',
                    'payslips',
                    'payroll_period_staff_schedules',
                    'payroll_periods',
                    'payroll_compensation_deductions',
                    'payroll_compensations',
                    'payroll_deduction_brackets',
                    'payroll_deduction_types',
                    'staff_schedule_assignments',
                    'staff_schedule_days',
                    'staff_schedules',
                    'staff_attendance_requests',
                    'staff_calendar_events',
                    'payslip_templates',
                ],
                'soft_deletes' => [],
            ],

            'devices' => [
                'label' => 'Devices & Scan Logs',
                'area' => 'People',
                'description' => 'Biometric and gate devices with their pairing, queued device commands, ZKTeco user mappings, raw punch logs and RFID scans.',
                'tables' => [
                    'attendance_logs',
                    'zk_user_mappings',
                    'device_commands',
                    'biometric_devices',
                    'rfid_scan_logs',
                    'gate_unresolved_scans',
                    'gate_sms_settings',
                    'gate_devices',
                ],
                'soft_deletes' => [],
            ],

            'communications' => [
                'label' => 'Announcements, Chat & SMS',
                'area' => 'Communication',
                'description' => 'Announcements with their attachments, targeting and read receipts; chat conversations, participants and messages; queued and sent SMS with gateways, settings and opt-outs.',
                'tables' => [
                    'announcement_reads',
                    'announcement_attachments',
                    'announcement_sections',
                    'announcement_grade_levels',
                    'announcements',
                    'chat_participants',
                    'chat_messages',
                    'chat_conversations',
                    'sms_messages',
                    'sms_opt_outs',
                    'sms_settings',
                    'sms_gateways',
                ],
                // Deleting a chat message soft-deletes it so the thread keeps
                // its shape; a clean-up has no thread left to keep.
                'soft_deletes' => ['chat_messages'],
            ],

            'tala' => [
                'label' => 'Tala Conversations',
                'area' => 'Communication',
                'description' => 'Chats with the AI assistant, its messages and the assessment proposals it produced. The API key and the per-teacher access grants are configuration and are kept.',
                'tables' => [
                    'tala_messages',
                    'tala_assessment_proposals',
                    'tala_conversations',
                ],
                'soft_deletes' => [],
            ],

            'structure' => [
                'label' => 'Academic Structure',
                'area' => 'Structure',
                'description' => 'Sections, subjects and subject templates, tracks and strands, departments, grading scales, and the certificate and ID card templates. Grade levels are platform-wide and are never touched.',
                'tables' => [
                    // Subjects reference sections, sections reference strands,
                    // strands reference tracks. Down the chain in that order.
                    'subjects',
                    'subject_template_items',
                    'subject_templates',
                    'class_sections',
                    'strands',
                    'tracks',
                    'departments',
                    'grading_scale_bands',
                    'grading_scales',
                    'certificates',
                    'id_card_templates',
                ],
                'soft_deletes' => ['class_sections'],
            ],

            'roles' => [
                'label' => 'School-built Roles',
                'area' => 'Structure',
                'description' => 'Roles this school created in its own role builder, and the permissions on them. Refused while any staff member is still attached to one — see the blocker it raises. System roles are shared across the platform and are never touched.',
                'tables' => [
                    'role_permissions',
                    'roles',
                ],
                'soft_deletes' => [],
            ],
        ];
    }

    /**
     * @return array<string>
     */
    public static function keys(): array
    {
        return array_keys(self::all());
    }

    public static function exists(string $group): bool
    {
        return array_key_exists($group, self::all());
    }

    public static function label(string $group): string
    {
        return self::all()[$group]['label'] ?? $group;
    }

    /**
     * Tables a group deletes from, in delete order.
     *
     * @return array<string>
     */
    public static function tables(string $group): array
    {
        return self::all()[$group]['tables'] ?? [];
    }

    /**
     * Every table these groups touch, de-duplicated.
     *
     * @param  array<string>  $groups
     * @return array<string>
     */
    public static function tablesFor(array $groups): array
    {
        $tables = [];

        foreach ($groups as $group) {
            foreach (self::tables($group) as $table) {
                $tables[$table] = true;
            }
        }

        return array_keys($tables);
    }

    public static function hasSoftDeletes(string $table): bool
    {
        foreach (self::all() as $definition) {
            if (in_array($table, $definition['soft_deletes'], true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * How to narrow a table to one institution when it has no `institution_id`.
     *
     * Two kinds of entry:
     *
     *  - `parent` — the row belongs to the institution that owns the row it
     *    points at. Chains are resolved recursively, so an assessment answer
     *    reaches its institution through attempt → ECR item → ECR → subject.
     *  - `enrolled_student` — the row hangs off a student and nothing else.
     *    Scoped through `student_institutions`, which is as close as the schema
     *    allows.
     *
     * Kept as an explicit map rather than probed off the schema: a column
     * appearing on a table later must not silently change what a clean-up
     * deletes. A table absent from this map is scoped on its own
     * `institution_id`.
     *
     * @return array<string, array{via: string, parent?: string, foreign_key: string}>
     */
    public static function scoping(): array
    {
        return [
            // Academics — everything reaches an institution through its subject
            // or its section.
            'student_assessment_answers' => ['via' => 'parent', 'parent' => 'student_assessment_attempts', 'foreign_key' => 'attempt_id'],
            'student_assessment_attempts' => ['via' => 'parent', 'parent' => 'subject_ecr_items', 'foreign_key' => 'subject_ecr_item_id'],
            'assessment_questions' => ['via' => 'parent', 'parent' => 'subject_ecr_items', 'foreign_key' => 'subject_ecr_item_id'],
            'student_ecr_item_scores' => ['via' => 'parent', 'parent' => 'subject_ecr_items', 'foreign_key' => 'subject_ecr_item_id'],
            'subject_ecr_items' => ['via' => 'parent', 'parent' => 'subjects_ecr', 'foreign_key' => 'subject_ecr_id'],
            'subjects_ecr' => ['via' => 'parent', 'parent' => 'subjects', 'foreign_key' => 'subject_id'],
            'subject_summative_assessments' => ['via' => 'parent', 'parent' => 'subjects', 'foreign_key' => 'subject_id'],
            'student_running_grades' => ['via' => 'parent', 'parent' => 'subjects', 'foreign_key' => 'subject_id'],
            'student_subjects' => ['via' => 'parent', 'parent' => 'subjects', 'foreign_key' => 'subject_id'],
            'student_lesson_progress' => ['via' => 'parent', 'parent' => 'topics', 'foreign_key' => 'topic_id'],
            'lesson_plans' => ['via' => 'parent', 'parent' => 'subjects', 'foreign_key' => 'subject_id'],
            'topics' => ['via' => 'parent', 'parent' => 'subjects', 'foreign_key' => 'subject_id'],
            'subject_quarter_plans' => ['via' => 'parent', 'parent' => 'subjects', 'foreign_key' => 'subject_id'],
            'ai_generation_tasks' => ['via' => 'parent', 'parent' => 'subjects', 'foreign_key' => 'subject_id'],
            'student_attendances' => ['via' => 'parent', 'parent' => 'class_sections', 'foreign_key' => 'class_section_id'],
            'student_sections' => ['via' => 'parent', 'parent' => 'class_sections', 'foreign_key' => 'section_id'],

            // The one table with no route to an institution but the student.
            'core_value_markings' => ['via' => 'enrolled_student', 'foreign_key' => 'student_id'],

            // Finance.
            'payment_plan_installments' => ['via' => 'parent', 'parent' => 'payment_plans', 'foreign_key' => 'payment_plan_id'],
            'sibling_group_members' => ['via' => 'parent', 'parent' => 'sibling_groups', 'foreign_key' => 'sibling_group_id'],
            'disbursement_receipts' => ['via' => 'parent', 'parent' => 'disbursements', 'foreign_key' => 'disbursement_id'],

            // HRIS and payroll.
            'payslip_deductions' => ['via' => 'parent', 'parent' => 'payslips', 'foreign_key' => 'payslip_id'],
            'payslip_days' => ['via' => 'parent', 'parent' => 'payslips', 'foreign_key' => 'payslip_id'],
            'staff_loan_installments' => ['via' => 'parent', 'parent' => 'staff_loans', 'foreign_key' => 'staff_loan_id'],
            'staff_loan_events' => ['via' => 'parent', 'parent' => 'staff_loans', 'foreign_key' => 'staff_loan_id'],
            'payroll_period_staff_schedules' => ['via' => 'parent', 'parent' => 'payroll_periods', 'foreign_key' => 'payroll_period_id'],
            'payroll_compensation_deductions' => ['via' => 'parent', 'parent' => 'payroll_compensations', 'foreign_key' => 'payroll_compensation_id'],
            'payroll_deduction_brackets' => ['via' => 'parent', 'parent' => 'payroll_deduction_types', 'foreign_key' => 'deduction_type_id'],
            'staff_schedule_days' => ['via' => 'parent', 'parent' => 'staff_schedules', 'foreign_key' => 'staff_schedule_id'],

            // Communication.
            'announcement_reads' => ['via' => 'parent', 'parent' => 'announcements', 'foreign_key' => 'announcement_id'],
            'announcement_attachments' => ['via' => 'parent', 'parent' => 'announcements', 'foreign_key' => 'announcement_id'],
            'announcement_sections' => ['via' => 'parent', 'parent' => 'announcements', 'foreign_key' => 'announcement_id'],
            'announcement_grade_levels' => ['via' => 'parent', 'parent' => 'announcements', 'foreign_key' => 'announcement_id'],
            'chat_participants' => ['via' => 'parent', 'parent' => 'chat_conversations', 'foreign_key' => 'conversation_id'],

            // Structure.
            'subject_template_items' => ['via' => 'parent', 'parent' => 'subject_templates', 'foreign_key' => 'template_id'],
            'grading_scale_bands' => ['via' => 'parent', 'parent' => 'grading_scales', 'foreign_key' => 'grading_scale_id'],
            'role_permissions' => ['via' => 'parent', 'parent' => 'roles', 'foreign_key' => 'role_id'],
        ];
    }

    /**
     * Narrowings applied on top of the institution scope.
     *
     * `roles` is the only one: a school shares the platform's system roles with
     * every other tenant, and a clean-up that deleted those would take
     * institution-administrator away from every school on the server. Only roles
     * the school itself built (`is_system = 0`) are in scope.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function extraConditions(): array
    {
        return [
            'roles' => ['is_system' => 0],
        ];
    }

    /**
     * Rows this clean-up leaves behind that would be broken by deleting a table.
     *
     * The pattern is FinanceDataGroups' — a count of rows that **survive** the
     * run while pointing at something it deleted — but there is only one such
     * hazard here, because a clean-up takes the whole institution rather than
     * one year out of several, so almost nothing is left to strand.
     *
     * That one hazard matters a great deal. `user_institutions.role_id` is what
     * decides a staff member's permissions, and deleting the role it points at
     * is SET NULL: the delete succeeds, and the next morning a school full of
     * teachers signs in to a system that shows them nothing. The whole point of
     * the clean-up is that the people survive it usable, so the run refuses
     * instead and says which staff to move first.
     *
     * @return array<string, array<int, array{table: string, column: string, rule: string, note: string}>>
     */
    public static function dependents(): array
    {
        return [
            'roles' => [
                [
                    'table' => 'user_institutions',
                    'column' => 'role_id',
                    'rule' => 'set_null',
                    'note' => 'the staff holding them would keep their login and lose every permission it grants',
                ],
                [
                    'table' => 'users',
                    'column' => 'role_id',
                    'rule' => 'set_null',
                    'note' => 'their fallback legacy role would be gone too, leaving nothing to resolve permissions from',
                ],
            ],
        ];
    }

    /**
     * @return array<int, array{table: string, column: string, rule: string, note: string}>
     */
    public static function dependentsOf(string $table): array
    {
        return self::dependents()[$table] ?? [];
    }

    /**
     * What a clean-up never deletes, for the screen to state outright.
     *
     * Written as a list of promises rather than a list of tables: the operator
     * is deciding whether to empty a live school, and "student_guardians is not
     * in any group" is not the reassurance they need.
     *
     * @return array<int, array{label: string, detail: string}>
     */
    public static function kept(): array
    {
        return [
            [
                'label' => 'Students, in full',
                'detail' => 'Student records, their enrolment in this school, profiles, guardians, emergency contacts, health records, uploaded documents, RFID tags and portal logins.',
            ],
            [
                'label' => 'Staff and teachers, in full',
                'detail' => 'User logins, their membership of this institution, their assigned role, and every personal-information record — addresses, family, children, education, eligibility and work experience.',
            ],
            [
                'label' => 'The institution itself',
                'detail' => 'The institution record and its branding, academic years, feature access, subscription and payment gateway configuration.',
            ],
            [
                'label' => 'Platform-wide records',
                'detail' => 'Grade levels and system roles are shared by every school on the platform and are never touched by a clean-up of one tenant.',
            ],
            [
                'label' => 'Audit trails',
                'detail' => 'Finance data-clear logs, student portal auth logs and the clean-up history itself survive, so what was deleted stays answerable after the data is gone.',
            ],
            [
                'label' => 'Tala configuration',
                'detail' => 'The API key the school chats through and the per-teacher access grants are kept; only the conversations are cleared.',
            ],
        ];
    }
}
