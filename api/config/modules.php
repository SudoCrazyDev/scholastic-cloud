<?php

/*
|--------------------------------------------------------------------------
| Module catalog
|--------------------------------------------------------------------------
|
| The single source of truth for what an institution can hand out to a role.
| Every module carries two abilities — `view` (read) and `manage` (create,
| edit, delete) — and a permission string is written as "<module>.<ability>",
| e.g. "finance.manage".
|
| `special` abilities sit outside the view/manage pair because they are
| approvals and escalations rather than plain reads or writes. They are
| addressed the same way: "<module>.<ability>".
|
| The frontend reads this catalog over /api/permissions/catalog, so the
| sidebar, the role builder and the API middleware all agree on module keys
| without the list being written down twice.
|
| Modules flagged `system_only` are platform administration — they stay with
| super-administrators and are never offered in an institution's role builder.
|
*/

return [

    /*
    |--------------------------------------------------------------------------
    | Personal modules
    |--------------------------------------------------------------------------
    |
    | Screens that only ever show the signed-in person their own data (their
    | profile, their payslip, their class load). These are deliberately not
    | permission-gated — locking someone out of their own record is never what
    | an institution means by "restrict access" — so they are listed here for
    | documentation only and carry no permissions.
    |
    */
    'personal' => [
        'dashboard',
        'my-personal-info',
        'my-subject',
        'my-lessons',
        'my-assessments',
        'my-finance',
        'my-class-sections',
        'my-assigned-subjects',
        'my-timesheet',
        // Group chat. A teacher's own advisory and subject groups, and the
        // student's mirror of the same — their own conversations, so no role
        // grants access to them and none can take it away. Who is in a group is
        // derived from enrolment (App\Services\Chat\ChatMembershipSync), which
        // is what does the gating. Administering chat across an institution is a
        // separate concern and is not this entry.
        'my-chats',
    ],

    /*
    |--------------------------------------------------------------------------
    | Permissioned modules
    |--------------------------------------------------------------------------
    */
    'groups' => [

        'communication' => [
            'label' => 'Communication',
            'modules' => [
                'announcements' => [
                    'label' => 'Announcements',
                    'description' => 'Read the announcement board; manage lets a role publish to it.',
                ],
            ],
        ],

        'assistant' => [
            'label' => 'Assistant',
            'modules' => [
                'tala' => [
                    'label' => 'Tala',
                    'description' => 'The AI teaching assistant. Who may chat with Tala is chosen teacher by teacher on the Tala screen, not here — a role only decides who administers it.',

                    /*
                     * Tala is the one module a role cannot hand out.
                     *
                     * Access is per teacher: an administrator grants it from the
                     * Tala screen, and `tala_access` is the only source of
                     * `tala.view` and `tala.manage` (see HasModulePermissions).
                     * Offering the usual View/Manage boxes here would let an
                     * administrator tick something that then does nothing, which
                     * is worse than not offering it.
                     */
                    'base_abilities' => [],

                    'special' => [
                        'configure' => [
                            'label' => 'Administer Tala',
                            'description' => 'Set the API key the school chats through, choose which teachers may use Tala, and cap how much each of them may send.',
                        ],
                    ],
                ],
            ],
        ],

        'academics' => [
            'label' => 'Academics',
            'modules' => [
                'class-sections' => [
                    'label' => 'Class Sections',
                    'description' => 'Sections, advisers and student rosters.',
                ],
                'subjects' => [
                    'label' => 'Subjects',
                    'description' => 'Subjects, subject templates and teacher assignment.',
                    'special' => [
                        'view-all' => [
                            'label' => 'See every subject in the school',
                            'description' => 'My Assigned Subjects lists the whole school rather than only the subjects this person advises. Tick it for a role that oversees other teachers\' subjects — a principal, an administrator, a department head. A subject teacher holds Manage on their own subjects without it.',
                        ],
                    ],
                ],
                'timetable' => [
                    'label' => 'Timetable',
                    'description' => 'Class scheduling across sections.',
                ],
                'grade-levels' => [
                    'label' => 'Grade Levels',
                    'description' => 'Grade levels offered by the institution.',
                ],
                'grading-scales' => [
                    'label' => 'Grading Scales',
                    'description' => 'Transmutation tables and grade bands.',
                ],
                'consolidated-grades' => [
                    'label' => 'Consolidated Grades',
                    'description' => 'Section-wide grade sheets and report cards.',
                    'special' => [
                        'approve' => [
                            'label' => 'Approve submitted grades',
                            'description' => 'Sign off on grades a teacher has submitted.',
                        ],
                    ],
                ],
                'proficiency' => [
                    'label' => 'Proficiency',
                    'description' => 'Core values and proficiency markings.',
                ],
                'school-days' => [
                    'label' => 'School Days',
                    'description' => 'School calendar and counted attendance days.',
                ],
                'tracks-strands' => [
                    'label' => 'Tracks & Strands',
                    'description' => 'Senior high tracks and strands.',
                ],
            ],
        ],

        'students' => [
            'label' => 'Students',
            'modules' => [
                'students' => [
                    'label' => 'Students',
                    'description' => 'Student records, guardians, documents and health records.',
                    'special' => [
                        'reset-portal-password' => [
                            'label' => 'Reset a student portal password',
                            'description' => 'Set up a student portal login, and issue a new password for one that exists, without being able to move an existing login to a different email address. Manage already includes this; tick it for a role that should help a student sign in but not edit student records.',
                        ],
                    ],
                ],
                'student-attendance' => [
                    'label' => 'Student Attendance',
                    'description' => 'Daily and per-subject student attendance.',
                    'special' => [
                        'approve' => [
                            'label' => 'Approve attendance submissions',
                            'description' => 'Approve or take back a teacher\'s attendance submission.',
                        ],
                    ],
                ],
                'admission-forms' => [
                    'label' => 'Admission Forms',
                    'description' => 'Online admission form builder and submissions.',
                ],
                'gate-entries' => [
                    'label' => 'Gate Entries',
                    'description' => 'RFID gate scan logs and entry notifications.',
                ],
            ],
        ],

        'finance' => [
            'label' => 'Finance',
            'modules' => [
                'finance' => [
                    'label' => 'Finance',
                    'description' => 'Student ledgers, payments and receipts.',
                    'special' => [
                        'request-void' => [
                            'label' => 'Request a payment void',
                            'description' => 'Raise a void request for a posted payment.',
                        ],
                        'approve-void' => [
                            'label' => 'Approve payment voids',
                            'description' => 'Approve or decline void requests raised by others.',
                        ],
                        'void-immediately' => [
                            'label' => 'Void without approval',
                            'description' => 'Void a payment outright, skipping the request queue.',
                        ],
                        'clear-data' => [
                            'label' => 'Clear Finance data',
                            'description' => 'Permanently delete a year\'s payments, charges, discounts and fee setup. Payment plans, finance announcements and disbursements are never touched. This cannot be undone — grant it only to the people who would be asked to authorise it.',
                        ],
                    ],
                ],
                'school-fees' => [
                    'label' => 'School Fees',
                    'description' => 'Fee structures and per-grade-level defaults.',
                ],
                'payment-plans' => [
                    'label' => 'Payment Plans',
                    'description' => 'Installment plans and plan change requests.',
                ],
                'discounts' => [
                    'label' => 'Discounts',
                    'description' => 'Default, grade-level and sibling discounts.',
                    'special' => [
                        'void' => [
                            'label' => 'Void a discount',
                            'description' => 'Take back a discount already applied to a student, with a note.',
                        ],
                    ],
                ],
                'disbursements' => [
                    'label' => 'Disbursements',
                    'description' => 'Outgoing money and disbursement receipts.',
                ],
                'finance-reports' => [
                    'label' => 'Finance Reports',
                    'description' => 'Collection dashboards and finance reporting.',
                ],
            ],
        ],

        'hris' => [
            'label' => 'HRIS',
            'modules' => [
                'staffs' => [
                    'label' => 'Staffs',
                    'description' => 'Staff records and employment details.',
                ],
                'staff-schedules' => [
                    'label' => 'Staff Schedules',
                    'description' => 'Shift templates and schedule assignment.',
                ],
                'attendance-logs' => [
                    'label' => 'Attendance Logs',
                    'description' => 'Biometric punch logs and timesheets.',
                ],
                'attendance-requests' => [
                    'label' => 'Attendance Requests',
                    'description' => 'Staff corrections to their own attendance.',
                    'special' => [
                        'approve' => [
                            'label' => 'Approve attendance requests',
                            'description' => 'Approve or decline staff attendance corrections.',
                        ],
                    ],
                ],
                'payroll' => [
                    'label' => 'Payroll',
                    'description' => 'Payroll periods, compensation, deductions, loans and payslips.',
                    'special' => [
                        'release' => [
                            'label' => 'Release payslips',
                            'description' => 'Finalise a payroll period and publish payslips to staff.',
                        ],
                        'approve-loan' => [
                            'label' => 'Approve staff loans',
                            'description' => 'Sign off a staff loan so it starts coming off payroll, or call one back.',
                        ],
                    ],
                ],
                'biometric-devices' => [
                    'label' => 'Biometric Devices',
                    'description' => 'ZKTeco devices, pairing and device commands.',
                ],
                'zk-users' => [
                    'label' => 'ZK Users',
                    'description' => 'Mapping between device users and staff records.',
                ],
            ],
        ],

        'sms' => [
            'label' => 'SMS Gateway',
            'modules' => [
                'sms-gateways' => [
                    'label' => 'Gateways',
                    'description' => 'On-premise SMS gateway devices and pairing.',
                ],
                'sms-messages' => [
                    'label' => 'Messages',
                    'description' => 'Outbound message queue and delivery history.',
                ],
                'sms-settings' => [
                    'label' => 'SMS Settings',
                    'description' => 'Templates, triggers and opt-out handling.',
                ],
            ],
        ],

        'administration' => [
            'label' => 'Administration',
            'modules' => [
                'users' => [
                    'label' => 'Users',
                    'description' => 'Staff logins and institution assignment.',
                    'special' => [
                        'assume' => [
                            'label' => 'Sign in as another user',
                            'description' => 'Impersonate a user to troubleshoot their account.',
                        ],
                    ],
                ],
                'roles' => [
                    'label' => 'Roles & Access',
                    'description' => 'Create roles and decide what each one can reach.',
                ],
                'departments' => [
                    'label' => 'Departments',
                    'description' => 'Departments and department heads.',
                ],
                'settings' => [
                    'label' => 'Institution Settings',
                    'description' => 'Academic year, branding and institution profile.',
                ],
                'institutions' => [
                    'label' => 'Institutions',
                    'description' => 'Platform-wide institution records.',
                    'system_only' => true,
                ],
                'subscriptions' => [
                    'label' => 'Subscriptions',
                    'description' => 'Platform-wide subscription plans.',
                    'system_only' => true,
                ],
                'feature-access' => [
                    'label' => 'Feature Access',
                    'description' => 'Decide which institutions have which features. Not the same as a role: a feature switched off here is closed to the whole school, including its own administrator.',
                    'system_only' => true,
                ],
                'payment-gateways' => [
                    'label' => 'Payment Gateways',
                    'description' => 'Which merchant account each institution takes online payments through, and the keys it does so with. Platform-only: a school can neither set nor read its own keys, though the money lands in that school\'s own account.',
                    'system_only' => true,
                ],
            ],
        ],

        'tools' => [
            'label' => 'Tools',
            'modules' => [
                'certificate-builder' => [
                    'label' => 'Certificate Builder',
                    'description' => 'Certificate and award templates.',
                ],
                'form-builder' => [
                    'label' => 'Form Builder',
                    'description' => 'Admission and custom form layouts.',
                ],
                'id-card-builder' => [
                    'label' => 'Student ID Builder',
                    'description' => 'ID card templates and batch printing.',
                ],
                'receipt-templates' => [
                    'label' => 'Receipt Templates',
                    'description' => 'Printed receipt and payslip layouts.',
                ],
            ],
        ],
    ],
];
