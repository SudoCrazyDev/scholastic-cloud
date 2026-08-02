<?php

namespace App\Support;

/**
 * What each of the platform's built-in roles can reach.
 *
 * This is the single source of truth for built-in access, used both by
 * RolePermissionSeeder and by Role itself when a built-in role is created (so
 * a freshly migrated database — or a test that builds a "principal" — gets a
 * role that behaves like the real one).
 *
 * The sets were read off the sidebar's `allowedRoles` lists and the role checks
 * in the controllers as they stood before module permissions existed, so
 * turning enforcement on changed nothing for an existing tenant.
 *
 * Institution-created roles are never touched by any of this — they hold
 * exactly what their school configured.
 */
class SystemRolePermissions
{
    /**
     * Modules a role gets full view + manage on.
     *
     * @var array<string, array<string>>
     */
    public const MANAGE = [
        // The two institution-wide roles reached every screen the old sidebar
        // offered a school. `users`, `institutions` and `subscriptions` are
        // deliberately absent — those were super-administrator only, and a
        // school manages its people through Staffs.
        //
        // `roles` is the one addition: an institution has to be able to open
        // the role builder for this feature to mean anything.
        //
        // `tala` is deliberately absent from every list in this file. Chatting
        // with Tala is granted to individual teachers by an administrator and
        // lives in `tala_access`, so no role confers it — see
        // HasModulePermissions. What a role still carries is `tala.configure`
        // (SPECIAL, below): the right to set the school's key and decide who
        // gets access. Running a school and using the assistant are now two
        // different things, and an administrator who wants to chat grants it to
        // themselves on the same screen.
        'institution-administrator' => [
            'announcements', 'class-sections', 'subjects', 'timetable',
            'grading-scales', 'consolidated-grades', 'proficiency', 'school-days',
            'tracks-strands', 'students', 'student-attendance', 'admission-forms',
            'gate-entries', 'finance', 'school-fees', 'payment-plans', 'discounts',
            'disbursements', 'finance-reports', 'staffs', 'staff-schedules',
            'attendance-logs', 'attendance-requests', 'payroll', 'biometric-devices',
            'zk-users', 'sms-gateways', 'sms-messages', 'sms-settings',
            'roles', 'departments', 'settings', 'certificate-builder', 'form-builder',
            'id-card-builder', 'receipt-templates',
        ],

        'principal' => [
            'announcements', 'class-sections', 'subjects', 'timetable',
            'grading-scales', 'consolidated-grades', 'proficiency', 'school-days',
            'tracks-strands', 'students', 'student-attendance', 'admission-forms',
            'gate-entries', 'finance', 'school-fees', 'payment-plans', 'discounts',
            'disbursements', 'finance-reports', 'staffs', 'staff-schedules',
            'attendance-logs', 'attendance-requests', 'payroll', 'biometric-devices',
            'zk-users', 'sms-gateways', 'sms-messages', 'sms-settings',
            'roles', 'departments', 'settings', 'certificate-builder', 'form-builder',
            'id-card-builder', 'receipt-templates',
        ],

        // Finance ran the money screens, the announcement board and the three
        // builders under Tools.
        'finance' => [
            'announcements', 'finance', 'school-fees', 'payment-plans', 'discounts',
            'disbursements', 'finance-reports', 'receipt-templates',
            'certificate-builder', 'form-builder', 'id-card-builder',
        ],

        // A teacher works their own subjects: lessons, class record, grades and
        // attendance, plus the builders under Tools.
        //
        // Tala used to be here, which gave it to every subject teacher at once.
        // It is granted per teacher now, so it is not a role's to hand out.
        'subject-teacher' => [
            'announcements', 'subjects', 'consolidated-grades', 'proficiency',
            'student-attendance', 'certificate-builder', 'form-builder', 'id-card-builder',
        ],

        'department-head' => [
            'announcements', 'subjects', 'consolidated-grades', 'proficiency',
            'student-attendance', 'certificate-builder', 'form-builder', 'id-card-builder',
        ],

        // Both only ever reached Consolidated Grades and Proficiency.
        'curriculum-head' => ['consolidated-grades', 'proficiency'],

        'assistant-principal' => ['consolidated-grades', 'proficiency'],

        // Registrar ran Students and Admission Forms.
        'registrar' => ['students', 'admission-forms'],

        // HR and HR Admin only ever saw the attendance-request queue, which is
        // open to all staff. They are intentionally left with nothing further —
        // widening them here would hand out access nobody asked for. A school
        // that wants a fuller HR role can now build one.
        'hr-admin' => [],
        'hr' => [],
        'staff' => [],
    ];

    /**
     * Modules a role can only read.
     *
     * Mostly the supporting lookups a granted screen needs to load: the Students
     * screen filters by grade level, Consolidated Grades needs sections, and so
     * on. Without these the granted page would open and then fail.
     *
     * @var array<string, array<string>>
     */
    public const VIEW = [
        // Grade Levels was a super-administrator screen, but every school-side
        // role needs to read the list to filter and label by grade.
        'institution-administrator' => ['grade-levels'],
        'principal' => ['grade-levels'],
        // Finance also had the two "My Work" items, which hang off Subjects.
        'finance' => ['students', 'class-sections', 'grade-levels', 'subjects'],
        'subject-teacher' => ['class-sections', 'students', 'school-days', 'grade-levels'],
        'department-head' => ['class-sections', 'students', 'school-days', 'grade-levels'],
        'curriculum-head' => ['class-sections', 'students', 'subjects', 'grade-levels'],
        'assistant-principal' => ['class-sections', 'students', 'subjects', 'grade-levels'],
        'registrar' => ['grade-levels', 'tracks-strands', 'class-sections'],
    ];

    /**
     * Approvals and escalations, kept exactly as the old role checks had them.
     *
     * @var array<string, array<string>>
     */
    public const SPECIAL = [
        'institution-administrator' => [
            'finance.request-void', 'finance.approve-void', 'finance.void-immediately',
            'attendance-requests.approve', 'student-attendance.approve',
            'consolidated-grades.approve', 'payroll.release', 'tala.configure',
        ],
        'principal' => [
            'finance.request-void', 'finance.approve-void', 'finance.void-immediately',
            'attendance-requests.approve', 'student-attendance.approve',
            'consolidated-grades.approve', 'payroll.release', 'tala.configure',
        ],
        // Finance both raises and reviews void requests, but does not skip the
        // queue — a void it raises from the ledger still becomes a pending
        // request. Only `void-immediately` bypasses that.
        'finance' => ['finance.request-void', 'finance.approve-void'],
    ];

    /**
     * Slugs that mean the same role under a different name.
     *
     * Roles were created per-tenant long before this file existed, so the same
     * job goes by more than one slug across schools — a role titled "Teacher"
     * slugs to `teacher`, not `subject-teacher`. Both spellings already appear
     * in the codebase's own role checks. Without this mapping such a role would
     * seed with no permissions and its holders would find every module gone.
     *
     * @var array<string, string>
     */
    public const ALIASES = [
        'institution-admin' => 'institution-administrator',
        'super-admin' => 'super-administrator',
        'teacher' => 'subject-teacher',
        'subject_teacher' => 'subject-teacher',
        'assistant-principal-head' => 'assistant-principal',
    ];

    /**
     * Resolve an alias to the slug whose permission set should be used.
     */
    public static function canonical(string $slug): string
    {
        return self::ALIASES[$slug] ?? $slug;
    }

    /**
     * Every slug this class knows how to configure, aliases included.
     *
     * @return array<string>
     */
    public static function slugs(): array
    {
        return array_values(array_unique(array_merge(
            ['super-administrator'],
            array_keys(self::MANAGE),
            array_keys(self::VIEW),
            array_keys(self::SPECIAL),
            array_keys(self::ALIASES),
        )));
    }

    public static function knows(string $slug): bool
    {
        return in_array(self::canonical($slug), self::slugs(), true);
    }

    /**
     * The permission strings a built-in role should hold.
     *
     * @return array<string>
     */
    public static function for(string $slug): array
    {
        $slug = self::canonical($slug);

        // Super-administrator holds the wildcard rather than an enumerated set,
        // so modules added to the catalog later are covered without a reseed.
        if ($slug === 'super-administrator') {
            return [Modules::WILDCARD];
        }

        $permissions = [];

        foreach (self::MANAGE[$slug] ?? [] as $module) {
            $permissions[] = "{$module}.view";
            $permissions[] = "{$module}.manage";
        }

        foreach (self::VIEW[$slug] ?? [] as $module) {
            $permissions[] = "{$module}.view";
        }

        foreach (self::SPECIAL[$slug] ?? [] as $permission) {
            $permissions[] = $permission;
        }

        return array_values(array_unique($permissions));
    }
}
