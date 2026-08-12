<?php

use App\Http\Controllers\AdmissionFormSubmissionController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BiometricDeviceController;
use App\Http\Controllers\BridgeController;
use App\Http\Controllers\CertificateController;
use App\Http\Controllers\ClassSectionController;
use App\Http\Controllers\CoreValueMarkingController;
use App\Http\Controllers\SmsBridgeController;
use App\Http\Controllers\SmsGatewayController;
use App\Http\Controllers\SmsMessageController;
use App\Http\Controllers\SmsSettingsController;
use App\Http\Controllers\GateSmsSettingController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DisbursementComponentTypeController;
use App\Http\Controllers\DisbursementController;
use App\Http\Controllers\DisbursementTypeController;
use App\Http\Controllers\FinanceDataClearController;
use App\Http\Controllers\FinanceDashboardController;
use App\Http\Controllers\GradeLevelController;
use App\Http\Controllers\DefaultDiscountController;
use App\Http\Controllers\GradeLevelDiscountController;
use App\Http\Controllers\IdCardTemplateController;
use App\Http\Controllers\InstitutionController;
use App\Http\Controllers\InternalPaymentCallbackController;
use App\Http\Controllers\PaymentPlanController;
use App\Http\Controllers\PaymentReceiptSubmissionController;
use App\Http\Controllers\PaymentTransactionController;
use App\Http\Controllers\PaymentVoidRequestController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\ReceiptTemplateController;
use App\Http\Controllers\RfidScanLogController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SchoolDayController;
use App\Http\Controllers\SchoolFeeController;
use App\Http\Controllers\SchoolFeeDefaultController;
use App\Http\Controllers\SectionConsolidatedGradesController;
use App\Http\Controllers\SF9Controller;
use App\Http\Controllers\SiblingGroupController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\StrandController;
use App\Http\Controllers\StudentAdditionalFeeController;
use App\Http\Controllers\StudentFeeController;
use App\Http\Controllers\StudentAttendanceController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\StudentDiscountController;
use App\Http\Controllers\StudentDocumentController;
use App\Http\Controllers\StudentEcrItemScoreController;
use App\Http\Controllers\StudentFinanceController;
use App\Http\Controllers\StudentOnlinePaymentController;
use App\Http\Controllers\StudentPaymentController;
use App\Http\Controllers\StudentPaymentPlanChangeController;
use App\Http\Controllers\StudentPaymentPlanController;
use App\Http\Controllers\StudentRfidTagController;
use App\Http\Controllers\StudentSectionController;
use App\Http\Controllers\SubjectController;
use App\Http\Controllers\SubjectTemplateController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\TimetableController;
use App\Http\Controllers\TrackController;
use App\Http\Controllers\UserAddressController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ZkUserMappingController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

// Bridge pairing (public — no auth; just a one-time code)
Route::post('/bridge/pair', [BridgeController::class, 'pair'])->middleware('throttle:pairing');

// Bridge endpoints (authenticated with per-device bridge token)
Route::middleware('auth.bridge.token')->group(function () {
    Route::post('/bridge/heartbeat', [BridgeController::class, 'heartbeat']);
    Route::post('/bridge/zk-users/sync', [BridgeController::class, 'syncUsers']);
    Route::get('/bridge/pending-enrollments', [BridgeController::class, 'pendingEnrollments']);
    Route::post('/bridge/enrollment-done', [BridgeController::class, 'enrollmentDone']);
});

// SMS gateway pairing (public — one-time code)
Route::post('/sms-gateway/pair', [SmsBridgeController::class, 'pair'])->middleware('throttle:pairing');

// SMS gateway kiosk endpoints (authenticated with per-gateway token)
Route::middleware('auth.sms.token')->group(function () {
    Route::post('/sms-gateway/heartbeat', [SmsBridgeController::class, 'heartbeat']);
    Route::get('/sms-gateway/outbox', [SmsBridgeController::class, 'outbox']);
    Route::post('/sms-gateway/outbox/status', [SmsBridgeController::class, 'outboxStatus']);
    Route::post('/sms-gateway/delivery-reports', [SmsBridgeController::class, 'deliveryReports']);
    Route::post('/sms-gateway/inbox', [SmsBridgeController::class, 'inbox']);
    Route::post('/sms-gateway/logs', [SmsBridgeController::class, 'logs']);
});

// Public routes (no authentication required)
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/payments/webhooks/maya', [InternalPaymentCallbackController::class, 'mayaStatus']);
// Backward-compatible alias.
Route::post('/internal/payment-callbacks/maya', [InternalPaymentCallbackController::class, 'mayaStatus']);

// Public kiosk endpoint for RFID gate scanners
Route::post('/kiosk/scan', [RfidScanLogController::class, 'kioskScan'])->middleware('throttle:pairing');

// Permanent (non-expiring) media links for uploaded files. Not behind auth
// because browsers request these from <img>/<a> without the bearer token —
// the signature on the URL is the access control.
Route::get('/media', [\App\Http\Controllers\MediaController::class, 'show'])
    ->middleware(\App\Http\Middleware\ValidateMediaSignature::class)
    ->name('media.show');

// Public online admission form (no auth)
Route::get('/public/institutions/{id}', [AdmissionFormSubmissionController::class, 'publicInstitution']);
Route::get('/public/grade-levels', [GradeLevelController::class, 'publicIndex']);
Route::post('/public/admission-form-submissions', [AdmissionFormSubmissionController::class, 'publicStore']);

// Protected routes (authentication required)
Route::middleware('auth.token')->group(function () {
    /*
    |--------------------------------------------------------------------------
    | Module access
    |--------------------------------------------------------------------------
    |
    | Routes below are gated with `module:<module>,<ability>`, resolved against
    | the permissions on the role the user holds at their active institution
    | (see config/modules.php and App\Http\Middleware\EnsureModuleAccess).
    |
    | Two things are deliberately left ungated:
    |
    |  - Personal endpoints — a person's own profile, own timesheet, own class
    |    load. Locking someone out of their own record is never what an
    |    institution means by restricting access.
    |  - Routes marked `,shared`, which the student portal also calls. Staff
    |    still need the permission; students are passed through to controllers
    |    that already scope the query to the signed-in student.
    |
    */

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/profile', [AuthController::class, 'profile']);
    Route::put('/profile/password', [AuthController::class, 'updatePassword']);
    Route::post('/assume-user', [AuthController::class, 'assumeUser'])->middleware('module:users,assume');
    Route::post('/assume-student', [AuthController::class, 'assumeStudent'])->middleware('module:users,assume');

    // The module catalog and the signed-in user's own permission set — needed
    // by the client before it can decide what to render, so never gated.
    Route::get('permissions/catalog', [PermissionController::class, 'catalog']);
    Route::get('permissions/me', [PermissionController::class, 'me']);

    // Desktop app specific endpoints - for offline data synchronization
    Route::prefix('desktop')->group(function () {
        Route::get('/institution', [\App\Http\Controllers\DesktopController::class, 'getInstitution']);
        Route::get('/class-sections', [\App\Http\Controllers\DesktopController::class, 'getClassSections']);
        Route::get('/assigned-loads', [\App\Http\Controllers\DesktopController::class, 'getAssignedLoads']);
        Route::get('/class-sections/{classSectionId}/students', [\App\Http\Controllers\DesktopController::class, 'getStudentsByClassSection']);
        Route::get('/ecr-data', [\App\Http\Controllers\DesktopController::class, 'getEcrData']);
        Route::get('/running-grades', [\App\Http\Controllers\DesktopController::class, 'getStudentRunningGrades']);
        Route::get('/sync', [\App\Http\Controllers\DesktopController::class, 'sync']);

        // Manual sync endpoints for running grades
        Route::get('/running-grades/download', [\App\Http\Controllers\DesktopController::class, 'downloadRunningGrades']);
        Route::post('/running-grades/upload', [\App\Http\Controllers\DesktopController::class, 'uploadRunningGrades']);
    });
    // Role routes — the role builder itself
    Route::apiResource('roles', RoleController::class)->middleware('module:roles,view');
    // Subscription routes
    Route::apiResource('subscriptions', SubscriptionController::class)->middleware('module:subscriptions,view');
    // Institution routes.
    //
    // Reading institutions is lookup data every signed-in staff member needs —
    // the sidebar's school name and logo, the institution picker on the Users
    // screen, the header on a printed ID card. Only creating and deleting
    // institutions is platform administration.
    //
    // Editing one is a school managing its own profile, so it answers to
    // Settings rather than to the platform-only Institutions module.
    Route::apiResource('institutions', InstitutionController::class)
        ->only(['index', 'show']);
    Route::apiResource('institutions', InstitutionController::class)
        ->only(['store', 'destroy'])
        ->middleware('module:institutions,manage');
    Route::apiResource('institutions', InstitutionController::class)
        ->only(['update'])
        ->middleware('module:settings,manage');
    Route::post('institutions/{id}', [InstitutionController::class, 'update'])->middleware('module:settings,manage'); // POST route for file uploads
    Route::put('institutions/{id}/academic-year', [InstitutionController::class, 'updateAcademicYear'])->middleware('module:settings,manage');
    // Per-institution color theme (self-serve for institution admins). Reading
    // the theme is what paints every screen, including a student's, so only the
    // write side is gated.
    Route::get('institution-theme', [\App\Http\Controllers\InstitutionThemeController::class, 'show']);
    Route::put('institution-theme', [\App\Http\Controllers\InstitutionThemeController::class, 'update'])->middleware('module:settings,manage');
    // Temporarily close the student portal for the caller's own institution.
    Route::get('student-portal-access', [\App\Http\Controllers\StudentPortalAccessController::class, 'show'])->middleware('module:settings,view');
    Route::put('student-portal-access', [\App\Http\Controllers\StudentPortalAccessController::class, 'update'])->middleware('module:settings,manage');
    Route::get('institutions/{id}/academic-years', [InstitutionController::class, 'getAcademicYears']);
    Route::put('institutions/{id}/academic-years/grading-periods', [InstitutionController::class, 'updateAcademicYearGradingPeriods'])->middleware('module:settings,manage');
    // Resolved quarter-vs-term structure for the signed-in user's institution.
    // Every grade screen needs it to label periods — ungated reference data.
    Route::get('grading-periods', [InstitutionController::class, 'gradingPeriods']);
    Route::get('grade-levels', [GradeLevelController::class, 'index'])->middleware('module:grade-levels,view');
    Route::post('grade-levels', [GradeLevelController::class, 'store'])->middleware('module:grade-levels,manage');
    Route::put('grade-levels/{id}', [GradeLevelController::class, 'update'])->middleware('module:grade-levels,manage');
    Route::delete('grade-levels/{id}', [GradeLevelController::class, 'destroy'])->middleware('module:grade-levels,manage');
    Route::apiResource('grading-scales', \App\Http\Controllers\GradingScaleController::class)->middleware('module:grading-scales,view');
    Route::get('departments', [DepartmentController::class, 'index'])->middleware('module:departments,view');
    Route::post('departments', [DepartmentController::class, 'store'])->middleware('module:departments,manage');
    Route::get('departments/{id}', [DepartmentController::class, 'show'])->middleware('module:departments,view');
    Route::put('departments/{id}', [DepartmentController::class, 'update'])->middleware('module:departments,manage');
    Route::patch('departments/{id}', [DepartmentController::class, 'update'])->middleware('module:departments,manage');
    Route::delete('departments/{id}', [DepartmentController::class, 'destroy'])->middleware('module:departments,manage');
    // The logo is branding shown to everyone signed in, including students.
    Route::get('institutions/{id}/logo', [InstitutionController::class, 'showLogo']);
    Route::post('institutions/{id}/logo', [InstitutionController::class, 'uploadLogo'])->middleware('module:settings,manage');
    Route::get('institutions/subscriptions/list', [InstitutionController::class, 'getSubscriptions'])->middleware('module:subscriptions,view');
    // User routes — "my" endpoints are the signed-in teacher's own load.
    Route::get('users/my/class-sections', [UserController::class, 'getMyClassSections']);
    Route::get('users/my/subjects', [UserController::class, 'getMySubjects']);
    Route::apiResource('users', UserController::class)->middleware('module:users,view');
    // Personal data sheet — every route below reads and writes only the
    // signed-in user's own record, so none of them are permission-gated.
    // UserOtherPersonalInfo routes (one-to-one, no index)
    Route::post('user-other-personal-info', [\App\Http\Controllers\UserOtherPersonalInfoController::class, 'store']);
    Route::get('user-other-personal-info', [\App\Http\Controllers\UserOtherPersonalInfoController::class, 'show']);
    Route::put('user-other-personal-info', [\App\Http\Controllers\UserOtherPersonalInfoController::class, 'update']);
    Route::patch('user-other-personal-info', [\App\Http\Controllers\UserOtherPersonalInfoController::class, 'update']);
    Route::delete('user-other-personal-info', [\App\Http\Controllers\UserOtherPersonalInfoController::class, 'destroy']);
    // UserFamily routes (one-to-one, no index)
    Route::post('user-family', [\App\Http\Controllers\UserFamilyController::class, 'store']);
    Route::get('user-family', [\App\Http\Controllers\UserFamilyController::class, 'show']);
    Route::put('user-family', [\App\Http\Controllers\UserFamilyController::class, 'update']);
    Route::patch('user-family', [\App\Http\Controllers\UserFamilyController::class, 'update']);
    Route::delete('user-family', [\App\Http\Controllers\UserFamilyController::class, 'destroy']);
    // UserAddress routes (one-to-one, no index)
    Route::apiResource('user-addresses', UserAddressController::class)->only(['store', 'show', 'update', 'destroy']);
    // UserChildren routes (CRUD)
    Route::apiResource('user-childrens', \App\Http\Controllers\UserChildrenController::class);
    // UserEducationalBackground routes (one-to-one, no index)
    Route::post('user-educational-background', [\App\Http\Controllers\UserEducationalBackgroundController::class, 'store']);
    Route::get('user-educational-background', [\App\Http\Controllers\UserEducationalBackgroundController::class, 'show']);
    Route::put('user-educational-background', [\App\Http\Controllers\UserEducationalBackgroundController::class, 'update']);
    Route::patch('user-educational-background', [\App\Http\Controllers\UserEducationalBackgroundController::class, 'update']);
    Route::delete('user-educational-background', [\App\Http\Controllers\UserEducationalBackgroundController::class, 'destroy']);
    // UserCivilServiceEligibility routes (CRUD)
    Route::apiResource('user-civil-service-eligibility', \App\Http\Controllers\UserCivilServiceEligibilityController::class);
    // UserWorkExperience routes (CRUD)
    Route::apiResource('user-work-experience', App\Http\Controllers\UserWorkExperienceController::class);
    // UserLearningDevelopment routes (one-to-one, no index)
    Route::post('user-learning-development', [\App\Http\Controllers\UserLearningDevelopmentController::class, 'store']);
    Route::get('user-learning-development', [\App\Http\Controllers\UserLearningDevelopmentController::class, 'show']);
    Route::put('user-learning-development', [\App\Http\Controllers\UserLearningDevelopmentController::class, 'update']);
    Route::patch('user-learning-development', [\App\Http\Controllers\UserLearningDevelopmentController::class, 'update']);
    Route::delete('user-learning-development', [\App\Http\Controllers\UserLearningDevelopmentController::class, 'destroy']);
    // Student routes - specific routes first to avoid conflicts
    Route::post('students/exists', [App\Http\Controllers\StudentController::class, 'exists'])->middleware('module:students,view');
    // Two kinds of role get in here and the controller separates what they may
    // do: whoever manages students can also move an existing login to another
    // email, while a reset-only role may create a login and nothing more.
    Route::post('students/{student}/auth', [App\Http\Controllers\StudentAuthController::class, 'store'])->middleware('module:students,manage|reset-portal-password');
    // Narrower than the line above on purpose: a new password, not a new login.
    // Held by roles that manage students and, separately, by subject teachers.
    Route::post('students/{student}/auth/reset-password', [App\Http\Controllers\StudentAuthController::class, 'resetPassword'])->middleware('module:students,reset-portal-password');
    Route::get('students/{student}/auth', [App\Http\Controllers\StudentAuthController::class, 'show'])->middleware('module:students,view');
    Route::get('students/{student}/auth/logs', [App\Http\Controllers\StudentAuthController::class, 'logs'])->middleware('module:students,view');
    // Ledger, notice of account and payment plan are read by the student's own
    // portal as well as by finance staff.
    Route::get('students/{id}/ledger', [StudentFinanceController::class, 'ledger'])->middleware('module:finance,view,shared');
    Route::get('students/{id}/noa', [StudentFinanceController::class, 'noticeOfAccount'])->middleware('module:finance,view,shared');
    Route::get('students/{id}/payment-plan', [StudentPaymentPlanController::class, 'show'])->middleware('module:payment-plans,view,shared');
    Route::post('students/{id}/payment-plan', [StudentPaymentPlanController::class, 'store'])->middleware('module:payment-plans,manage');
    Route::get('students/{id}/sibling-group', [SiblingGroupController::class, 'showForStudent'])->middleware('module:discounts,view');
    Route::get('payment-plan-changes', [StudentPaymentPlanChangeController::class, 'index'])->middleware('module:payment-plans,view');
    Route::apiResource('payment-plans', PaymentPlanController::class)->middleware('module:payment-plans,view');
    Route::get('students/search-for-assignment', [StudentController::class, 'searchForAssignment'])->middleware('module:students,view');
    Route::post('students/{id}/update', [StudentController::class, 'updateWithFile'])->middleware('module:students,manage');
    Route::put('students/{id}/admission-record', [StudentController::class, 'updateAdmissionRecord'])->middleware('module:students,manage');
    Route::get('students/{studentId}/documents', [StudentDocumentController::class, 'index'])->middleware('module:students,view,shared');
    Route::post('students/{studentId}/documents', [StudentDocumentController::class, 'store'])->middleware('module:students,manage,shared');
    Route::post('students/{studentId}/documents/{documentId}/cross-check', [StudentDocumentController::class, 'crossCheck'])->middleware('module:students,manage');
    Route::delete('students/{studentId}/documents/{documentId}', [StudentDocumentController::class, 'destroy'])->middleware('module:students,manage');
    // Students read their own record here (My Finance loads the student first).
    Route::apiResource('students', StudentController::class)->middleware('module:students,view,shared');
    // Staff routes
    Route::put('staffs/{id}/role', [StaffController::class, 'updateRole'])->middleware('module:staffs,manage');
    Route::post('staffs/{id}/reset-password', [StaffController::class, 'resetPassword'])->middleware('module:staffs,manage');
    Route::apiResource('staffs', StaffController::class)->middleware('module:staffs,view');
    // Track & Strand routes
    Route::get('tracks', [TrackController::class, 'index'])->middleware('module:tracks-strands,view');
    Route::post('tracks', [TrackController::class, 'store'])->middleware('module:tracks-strands,manage');
    Route::put('tracks/{id}', [TrackController::class, 'update'])->middleware('module:tracks-strands,manage');
    Route::delete('tracks/{id}', [TrackController::class, 'destroy'])->middleware('module:tracks-strands,manage');
    Route::get('strands', [StrandController::class, 'index'])->middleware('module:tracks-strands,view');
    Route::post('strands', [StrandController::class, 'store'])->middleware('module:tracks-strands,manage');
    Route::put('strands/{id}', [StrandController::class, 'update'])->middleware('module:tracks-strands,manage');
    Route::delete('strands/{id}', [StrandController::class, 'destroy'])->middleware('module:tracks-strands,manage');
    // ClassSection routes
    Route::get('class-sections/by-institution/{institutionId?}', [ClassSectionController::class, 'getByInstitution'])->middleware('module:class-sections,view');
    Route::get('class-sections/academic-years', [ClassSectionController::class, 'getAcademicYears'])->middleware('module:class-sections,view');
    Route::post('class-sections/{id}/dissolve', [ClassSectionController::class, 'dissolve'])->middleware('module:class-sections,manage');
    Route::post('class-sections/{id}/transfer-student', [ClassSectionController::class, 'transferStudent'])->middleware('module:class-sections,manage');
    Route::apiResource('class-sections', ClassSectionController::class)->middleware('module:class-sections,view');

    // Timetable routes
    Route::get('timetable/section/{sectionId}', [TimetableController::class, 'getSectionTimetable'])->middleware('module:timetable,view');
    Route::get('timetable/conflicts', [TimetableController::class, 'getConflicts'])->middleware('module:timetable,view');
    Route::get('timetable/teachers', [TimetableController::class, 'getTeachersTimetable'])->middleware('module:timetable,view');
    Route::patch('timetable/subjects/{subjectId}/schedule', [TimetableController::class, 'updateSubjectSchedule'])->middleware('module:timetable,manage');
    // Subject routes
    Route::get('subjects/by-institution', [SubjectController::class, 'indexByInstitution'])->middleware('module:subjects,view');
    Route::apiResource('subjects', SubjectController::class)->middleware('module:subjects,view,shared');
    Route::post('subjects/reorder', [SubjectController::class, 'reorder'])->middleware('module:subjects,manage');
    Route::post('subjects/reorder-children', [SubjectController::class, 'reorderChildren'])->middleware('module:subjects,manage');

    // Subject Template routes
    Route::apiResource('subject-templates', SubjectTemplateController::class)->middleware('module:subjects,view');
    Route::post('subject-templates/{id}/apply', [SubjectTemplateController::class, 'applyToSection'])->middleware('module:subjects,manage');

    // StudentSubject routes
    Route::apiResource('student-subjects', App\Http\Controllers\StudentSubjectController::class)->middleware('module:subjects,view,shared');
    Route::post('student-subjects/bulk-assign', [App\Http\Controllers\StudentSubjectController::class, 'bulkAssign'])->middleware('module:subjects,manage');
    // Topic routes
    Route::get('topics', [App\Http\Controllers\TopicController::class, 'index'])->middleware('module:subjects,view');
    Route::post('topics', [App\Http\Controllers\TopicController::class, 'store'])->middleware('module:subjects,manage');
    Route::post('topics/bulk', [App\Http\Controllers\TopicBulkController::class, 'store'])->middleware('module:subjects,manage');
    Route::get('topics/{id}', [App\Http\Controllers\TopicController::class, 'show'])->middleware('module:subjects,view');
    Route::put('topics/{id}', [App\Http\Controllers\TopicController::class, 'update'])->middleware('module:subjects,manage');
    Route::patch('topics/{id}', [App\Http\Controllers\TopicController::class, 'update'])->middleware('module:subjects,manage');
    Route::delete('topics/{id}', [App\Http\Controllers\TopicController::class, 'destroy'])->middleware('module:subjects,manage');
    Route::post('topics/reorder', [App\Http\Controllers\TopicController::class, 'reorder'])->middleware('module:subjects,manage');
    Route::patch('topics/{id}/toggle-completion', [App\Http\Controllers\TopicController::class, 'toggleCompletion'])->middleware('module:subjects,manage');
    Route::post('topics/{id}/upload', [App\Http\Controllers\TopicController::class, 'uploadAttachment'])->middleware('module:subjects,manage');
    Route::post('topics/{id}/copy', [App\Http\Controllers\TopicController::class, 'copyToSubjects'])->middleware('module:subjects,manage');

    // Subject quarter plans (AI planner)
    Route::get('subject-quarter-plans/by-subject-and-quarter', [App\Http\Controllers\SubjectQuarterPlanController::class, 'showBySubjectAndQuarter'])->middleware('module:subjects,view');
    Route::put('subject-quarter-plans/by-subject-and-quarter', [App\Http\Controllers\SubjectQuarterPlanController::class, 'upsertBySubjectAndQuarter'])->middleware('module:subjects,manage');

    // Lesson plans
    Route::get('lesson-plans', [App\Http\Controllers\LessonPlanController::class, 'index'])->middleware('module:subjects,view');
    Route::get('lesson-plans/{id}', [App\Http\Controllers\LessonPlanController::class, 'show'])->middleware('module:subjects,view');
    Route::patch('lesson-plans/{id}', [App\Http\Controllers\LessonPlanController::class, 'update'])->middleware('module:subjects,manage');
    Route::delete('lesson-plans/{id}', [App\Http\Controllers\LessonPlanController::class, 'destroy'])->middleware('module:subjects,manage');

    // AI planner generation endpoints
    Route::post('ai/subjects/{subjectId}/quarters/{quarter}/topics/generate', [App\Http\Controllers\AiPlannerController::class, 'generateTopics'])->middleware('module:subjects,manage');
    Route::post('ai/subjects/{subjectId}/quarters/{quarter}/lesson-plans/generate', [App\Http\Controllers\AiPlannerController::class, 'generateLessonPlans'])->middleware('module:subjects,manage');
    Route::post('ai/subjects/{subjectId}/quarters/{quarter}/assessments/generate', [App\Http\Controllers\AiPlannerController::class, 'generateAssessments'])->middleware('module:subjects,manage');
    Route::get('ai/generation-tasks/{taskId}/status', [App\Http\Controllers\AiPlannerController::class, 'checkGenerationStatus'])->middleware('module:subjects,view');

    /*
     * Tala — the AI teaching assistant.
     *
     * Separate from the `ai/*` planner routes above: those run on the one
     * platform-wide key in config/ai.php, Tala runs on a key the tenant
     * supplies. The abilities split three ways — `view` reads past threads,
     * `manage` is what lets a teacher actually chat (a message is a write, and
     * EnsureModuleAccess upgrades write verbs to `manage` regardless), and
     * `configure` is the school-wide key an administrator sets.
     */
    Route::get('tala/config', [App\Http\Controllers\TalaCredentialController::class, 'config'])->middleware('module:tala,view');

    /*
     * Who may chat. Gated on `tala.configure` — the administrator who supplies
     * the school's key is the one who hands it out. A teacher has no endpoint
     * here at all, by design: there is nothing left for them to set up.
     */
    Route::get('tala/access', [App\Http\Controllers\TalaAccessController::class, 'index'])->middleware('module:tala,configure');
    Route::put('tala/access', [App\Http\Controllers\TalaAccessController::class, 'update'])->middleware('module:tala,configure');

    Route::get('tala/institution-credentials', [App\Http\Controllers\TalaCredentialController::class, 'indexInstitution'])->middleware('module:tala,configure');
    Route::put('tala/institution-credentials', [App\Http\Controllers\TalaCredentialController::class, 'storeInstitution'])->middleware('module:tala,configure');
    Route::delete('tala/institution-credentials/{provider}', [App\Http\Controllers\TalaCredentialController::class, 'destroyInstitution'])->middleware('module:tala,configure');

    Route::get('tala/conversations', [App\Http\Controllers\TalaConversationController::class, 'index'])->middleware('module:tala,view');
    Route::post('tala/conversations', [App\Http\Controllers\TalaConversationController::class, 'store'])->middleware('module:tala,manage');
    Route::get('tala/conversations/{id}', [App\Http\Controllers\TalaConversationController::class, 'show'])->middleware('module:tala,view');
    Route::patch('tala/conversations/{id}', [App\Http\Controllers\TalaConversationController::class, 'update'])->middleware('module:tala,manage');
    Route::delete('tala/conversations/{id}', [App\Http\Controllers\TalaConversationController::class, 'destroy'])->middleware('module:tala,manage');
    Route::post('tala/conversations/{id}/messages', [App\Http\Controllers\TalaChatController::class, 'send'])->middleware('module:tala,manage');

    /*
     * Assessment suggestions Tala has drafted.
     *
     * `apply` is Tala's only write path into the gradebook, and it carries a
     * second gate on purpose: `subjects,manage` is what the Assessments screen
     * requires, so the assistant can never let a teacher change something they
     * could not change by hand. The model cannot reach any of this — it writes a
     * proposal row and the teacher clicks.
     */
    Route::get('tala/conversations/{conversationId}/proposals', [App\Http\Controllers\TalaProposalController::class, 'index'])->middleware('module:tala,view');
    Route::get('tala/proposals/{id}', [App\Http\Controllers\TalaProposalController::class, 'show'])->middleware('module:tala,view');
    Route::post('tala/proposals/{id}/apply', [App\Http\Controllers\TalaProposalController::class, 'apply'])->middleware(['module:tala,manage', 'module:subjects,manage']);
    Route::post('tala/proposals/{id}/discard', [App\Http\Controllers\TalaProposalController::class, 'discard'])->middleware('module:tala,manage');
    // SubjectEcr routes
    Route::apiResource('subjects-ecr', App\Http\Controllers\SubjectEcrController::class)->middleware('module:subjects,view');
    Route::post('subjects-ecr-items/images', [App\Http\Controllers\SubjectEcrItemController::class, 'uploadImage'])->middleware('module:subjects,manage');
    Route::delete('subjects-ecr-items/images', [App\Http\Controllers\SubjectEcrItemController::class, 'deleteImage'])->middleware('module:subjects,manage');
    Route::post('subjects-ecr-items/{id}/copy', [App\Http\Controllers\SubjectEcrItemController::class, 'copyToSubjects'])->middleware('module:subjects,manage');
    Route::apiResource('subjects-ecr-items', App\Http\Controllers\SubjectEcrItemController::class)->middleware('module:subjects,view,shared');
    // SubjectSummativeAssessment routes
    Route::apiResource('subject-summative-assessments', \App\Http\Controllers\SubjectSummativeAssessmentController::class)->middleware('module:subjects,view');
    // StudentSection routes
    Route::apiResource('student-sections', StudentSectionController::class)->middleware('module:class-sections,view,shared');
    Route::post('student-sections/bulk-assign', [StudentSectionController::class, 'bulkAssign'])->middleware('module:class-sections,manage');
    // StudentEcrItemScore routes
    Route::get('student-ecr-item-scores/by-subject-section', [StudentEcrItemScoreController::class, 'getScoresBySubjectAndSection'])->middleware('module:subjects,view');
    Route::get('student-ecr-item-scores/by-student-subject', [StudentEcrItemScoreController::class, 'getByStudentAndSubject'])->middleware('module:subjects,view,shared');
    Route::apiResource('student-ecr-item-scores', StudentEcrItemScoreController::class)->middleware('module:subjects,view,shared');
    // Student assessments (LMS: list/take quiz, assignment, exam; live score).
    // Student-portal endpoints: the controller resolves the signed-in student
    // and refuses anything that is not their own attempt.
    Route::get('student-assessments', [\App\Http\Controllers\StudentAssessmentController::class, 'index']);
    Route::get('student-assessments/{id}', [\App\Http\Controllers\StudentAssessmentController::class, 'show']);
    Route::post('student-assessments/{id}/start', [\App\Http\Controllers\StudentAssessmentController::class, 'start']);
    Route::post('student-assessments/{id}/submit', [\App\Http\Controllers\StudentAssessmentController::class, 'submit']);
    Route::post('student-assessments/{id}/upload', [\App\Http\Controllers\StudentAssessmentController::class, 'uploadAttachment']);
    // Student lessons (LMS: list/read published lessons + per-student progress)
    Route::get('student-lessons', [\App\Http\Controllers\StudentLessonController::class, 'index']);
    Route::get('student-lessons/{id}', [\App\Http\Controllers\StudentLessonController::class, 'show']);
    Route::post('student-lessons/{id}/start', [\App\Http\Controllers\StudentLessonController::class, 'start']);
    Route::post('student-lessons/{id}/complete', [\App\Http\Controllers\StudentLessonController::class, 'complete']);
    // Teacher grading of assessment submissions (manual questions: essays, uploads)
    Route::get('assessment-methods/{itemId}/submissions', [\App\Http\Controllers\AssessmentGradingController::class, 'submissions'])->middleware('module:subjects,view');
    Route::post('assessment-methods/{itemId}/submissions/{attemptId}/grade', [\App\Http\Controllers\AssessmentGradingController::class, 'grade'])->middleware('module:subjects,manage');
    Route::post('assessment-methods/{itemId}/submissions/recheck', [\App\Http\Controllers\AssessmentGradingController::class, 'recheck'])->middleware('module:subjects,manage');
    // StudentRunningGrade routes — students read their own grades from the
    // index here (My Subject), so the read side is shared.
    Route::post('student-running-grades/upsert-final-grade', [\App\Http\Controllers\StudentRunningGradeController::class, 'upsertFinalGrade'])->middleware('module:consolidated-grades,manage');
    Route::post('student-running-grades/bulk-upsert-final-grades', [\App\Http\Controllers\StudentRunningGradeController::class, 'bulkUpsertFinalGrades'])->middleware('module:consolidated-grades,manage');
    Route::post('student-running-grades/recalculate-parent-grades', [\App\Http\Controllers\StudentRunningGradeController::class, 'recalculateParentSubjectGrades'])->middleware('module:consolidated-grades,manage');
    Route::apiResource('student-running-grades', \App\Http\Controllers\StudentRunningGradeController::class)->middleware('module:consolidated-grades,view,shared');
    // StudentAttendance routes
    Route::post('student-attendances/bulk-upsert', [StudentAttendanceController::class, 'bulkUpsert'])->middleware('module:student-attendance,manage');
    Route::apiResource('student-attendances', StudentAttendanceController::class)->middleware('module:student-attendance,view,shared');
    // SchoolDays routes
    Route::post('school-days/bulk-upsert', [SchoolDayController::class, 'bulkUpsert'])->middleware('module:school-days,manage');
    Route::apiResource('school-days', SchoolDayController::class)->middleware('module:school-days,view');

    // School fee and student finance routes
    Route::apiResource('school-fees', SchoolFeeController::class)->middleware('module:school-fees,view');
    Route::get('finance/dashboard/students', [FinanceDashboardController::class, 'students'])->middleware('module:finance-reports,view');
    Route::post('school-fee-defaults/bulk-upsert', [SchoolFeeDefaultController::class, 'bulkUpsert'])->middleware('module:school-fees,manage');
    Route::post('school-fee-defaults/apply-all', [SchoolFeeDefaultController::class, 'applyToAll'])->middleware('module:school-fees,manage');
    Route::get('school-fee-defaults', [SchoolFeeDefaultController::class, 'index'])->middleware('module:school-fees,view');
    Route::post('school-fee-defaults', [SchoolFeeDefaultController::class, 'store'])->middleware('module:school-fees,manage');
    Route::put('school-fee-defaults/{id}', [SchoolFeeDefaultController::class, 'update'])->middleware('module:school-fees,manage');
    Route::patch('school-fee-defaults/{id}', [SchoolFeeDefaultController::class, 'update'])->middleware('module:school-fees,manage');
    Route::delete('school-fee-defaults/{id}', [SchoolFeeDefaultController::class, 'destroy'])->middleware('module:school-fees,manage');
    Route::get('student-payments', [StudentPaymentController::class, 'index'])->middleware('module:finance,view,shared');
    Route::post('student-payments', [StudentPaymentController::class, 'store'])->middleware('module:finance,manage');
    Route::get('student-payments/{id}', [StudentPaymentController::class, 'show'])->middleware('module:finance,view,shared');
    Route::get('student-payments/{id}/receipt', [StudentPaymentController::class, 'receipt'])->middleware('module:finance,view,shared');
    Route::get('payment-transactions/{id}', [PaymentTransactionController::class, 'show'])->middleware('module:finance,view,shared');
    Route::get('payment-transactions/{id}/receipt', [PaymentTransactionController::class, 'receipt'])->middleware('module:finance,view,shared');
    // Online payments are initiated by the student from their own portal.
    Route::get('student-online-payments', [StudentOnlinePaymentController::class, 'index'])->middleware('module:finance,view,shared');
    Route::post('student-online-payments/checkout', [StudentOnlinePaymentController::class, 'createCheckout'])->middleware('module:finance,manage,shared');
    Route::get('student-online-payments/{id}', [StudentOnlinePaymentController::class, 'show'])->middleware('module:finance,view,shared');
    Route::post('student-online-payments/{id}/outcome', [StudentOnlinePaymentController::class, 'recordOutcome'])->middleware('module:finance,manage,shared');
    Route::get('student-discounts', [StudentDiscountController::class, 'index'])->middleware('module:discounts,view,shared');
    Route::post('student-discounts', [StudentDiscountController::class, 'store'])->middleware('module:discounts,manage');
    Route::put('student-discounts/{id}', [StudentDiscountController::class, 'update'])->middleware('module:discounts,manage');
    Route::patch('student-discounts/{id}', [StudentDiscountController::class, 'update'])->middleware('module:discounts,manage');
    Route::delete('student-discounts/{id}', [StudentDiscountController::class, 'destroy'])->middleware('module:discounts,manage');
    Route::post('student-discounts/{id}/void', [StudentDiscountController::class, 'void'])->middleware('module:discounts,void');

    // Default (reusable) discounts
    Route::apiResource('default-discounts', DefaultDiscountController::class)->middleware('module:discounts,view');

    // Grade-level discounts
    Route::get('grade-level-discounts', [GradeLevelDiscountController::class, 'index'])->middleware('module:discounts,view');
    Route::post('grade-level-discounts', [GradeLevelDiscountController::class, 'store'])->middleware('module:discounts,manage');
    Route::post('grade-level-discounts/{id}/void-for-student', [GradeLevelDiscountController::class, 'voidForStudent'])->middleware('module:discounts,void');
    Route::put('grade-level-discounts/{id}', [GradeLevelDiscountController::class, 'update'])->middleware('module:discounts,manage');
    Route::patch('grade-level-discounts/{id}', [GradeLevelDiscountController::class, 'update'])->middleware('module:discounts,manage');
    Route::delete('grade-level-discounts/{id}', [GradeLevelDiscountController::class, 'destroy'])->middleware('module:discounts,manage');

    // Sibling groups & per-sibling discounts
    Route::get('sibling-groups', [SiblingGroupController::class, 'index'])->middleware('module:discounts,view');
    Route::post('sibling-groups', [SiblingGroupController::class, 'store'])->middleware('module:discounts,manage');
    Route::delete('sibling-groups/{id}', [SiblingGroupController::class, 'destroy'])->middleware('module:discounts,manage');
    Route::post('sibling-groups/{id}/members', [SiblingGroupController::class, 'addMember'])->middleware('module:discounts,manage');
    Route::put('sibling-groups/{id}/members/{memberId}', [SiblingGroupController::class, 'updateMember'])->middleware('module:discounts,manage');
    Route::delete('sibling-groups/{id}/members/{memberId}', [SiblingGroupController::class, 'removeMember'])->middleware('module:discounts,manage');
    Route::post('sibling-groups/{id}/members/{memberId}/apply-discount', [SiblingGroupController::class, 'applyDiscount'])->middleware('module:discounts,manage');

    // Student additional fees
    Route::get('student-additional-fees', [StudentAdditionalFeeController::class, 'index'])->middleware('module:finance,view,shared');
    Route::post('student-additional-fees', [StudentAdditionalFeeController::class, 'store'])->middleware('module:finance,manage');
    Route::put('student-additional-fees/{id}', [StudentAdditionalFeeController::class, 'update'])->middleware('module:finance,manage');
    Route::patch('student-additional-fees/{id}', [StudentAdditionalFeeController::class, 'update'])->middleware('module:finance,manage');
    Route::delete('student-additional-fees/{id}', [StudentAdditionalFeeController::class, 'destroy'])->middleware('module:finance,manage');
    Route::post('student-additional-fees/{id}/restore', [StudentAdditionalFeeController::class, 'restore'])->middleware('module:finance,manage');

    // Reusable student fees, searched and picked from the ledger
    Route::apiResource('student-fees', StudentFeeController::class)->middleware('module:school-fees,view');

    // Payment receipt submissions (student uploads proof of payment, finance verifies)
    Route::get('payment-receipt-submissions', [PaymentReceiptSubmissionController::class, 'index'])->middleware('module:finance,view,shared');
    Route::post('payment-receipt-submissions', [PaymentReceiptSubmissionController::class, 'store'])->middleware('module:finance,manage,shared');
    Route::post('payment-receipt-submissions/{id}/approve', [PaymentReceiptSubmissionController::class, 'approve'])->middleware('module:finance,manage');
    Route::post('payment-receipt-submissions/{id}/reject', [PaymentReceiptSubmissionController::class, 'reject'])->middleware('module:finance,manage');

    // Payment void requests (finance requests, admin approves/disapproves)
    Route::get('payment-void-requests', [PaymentVoidRequestController::class, 'index'])->middleware('module:finance,view');
    Route::post('payment-void-requests', [PaymentVoidRequestController::class, 'store'])->middleware('module:finance,request-void');
    Route::post('payment-void-requests/{id}/approve', [PaymentVoidRequestController::class, 'approve'])->middleware('module:finance,approve-void');
    Route::post('payment-void-requests/{id}/disapprove', [PaymentVoidRequestController::class, 'disapprove'])->middleware('module:finance,approve-void');

    // Receipt templates
    Route::apiResource('receipt-templates', ReceiptTemplateController::class)->middleware('module:receipt-templates,view');

    // Finance data clearing. Behind its own ability rather than `finance,manage`:
    // running the POS must not carry the power to delete what it recorded.
    // `preview` is a POST only because it takes an array of groups — it reads.
    Route::get('finance/data-clear/groups', [FinanceDataClearController::class, 'groups'])->middleware('module:finance,clear-data');
    Route::get('finance/data-clear/history', [FinanceDataClearController::class, 'history'])->middleware('module:finance,clear-data');
    Route::post('finance/data-clear/preview', [FinanceDataClearController::class, 'preview'])->middleware('module:finance,clear-data');
    Route::post('finance/data-clear', [FinanceDataClearController::class, 'store'])->middleware('module:finance,clear-data');

    // Disbursement types (dynamic expense categories)
    Route::get('disbursement-types', [DisbursementTypeController::class, 'index'])->middleware('module:disbursements,view');
    Route::post('disbursement-types', [DisbursementTypeController::class, 'store'])->middleware('module:disbursements,manage');
    Route::put('disbursement-types/{id}', [DisbursementTypeController::class, 'update'])->middleware('module:disbursements,manage');
    Route::patch('disbursement-types/{id}', [DisbursementTypeController::class, 'update'])->middleware('module:disbursements,manage');
    Route::delete('disbursement-types/{id}', [DisbursementTypeController::class, 'destroy'])->middleware('module:disbursements,manage');

    // Disbursement component types (how the money was dispensed; default "Cash Dispense")
    Route::get('disbursement-component-types', [DisbursementComponentTypeController::class, 'index'])->middleware('module:disbursements,view');
    Route::post('disbursement-component-types', [DisbursementComponentTypeController::class, 'store'])->middleware('module:disbursements,manage');
    Route::put('disbursement-component-types/{id}', [DisbursementComponentTypeController::class, 'update'])->middleware('module:disbursements,manage');
    Route::patch('disbursement-component-types/{id}', [DisbursementComponentTypeController::class, 'update'])->middleware('module:disbursements,manage');
    Route::delete('disbursement-component-types/{id}', [DisbursementComponentTypeController::class, 'destroy'])->middleware('module:disbursements,manage');

    // Disbursements / expenses (update is POST-based for multipart receipt uploads)
    Route::get('disbursements', [DisbursementController::class, 'index'])->middleware('module:disbursements,view');
    Route::post('disbursements', [DisbursementController::class, 'store'])->middleware('module:disbursements,manage');
    Route::get('disbursements/{id}', [DisbursementController::class, 'show'])->middleware('module:disbursements,view');
    Route::post('disbursements/{id}', [DisbursementController::class, 'update'])->middleware('module:disbursements,manage');
    Route::delete('disbursements/{id}', [DisbursementController::class, 'destroy'])->middleware('module:disbursements,manage');

    // Finance collections (monthly/quarterly breakdown)
    Route::get('finance/collections', [FinanceDashboardController::class, 'collections'])->middleware('module:finance-reports,view');

    // Finance collections detailed report (arbitrary date range)
    Route::get('finance/collections/report', [FinanceDashboardController::class, 'collectionsReport'])->middleware('module:finance-reports,view');

    // Section Consolidated Grades route
    Route::get('section-consolidated-grades', [SectionConsolidatedGradesController::class, 'index'])->middleware('module:consolidated-grades,view');
    Route::get('proficiency', [\App\Http\Controllers\ProficiencyController::class, 'index'])->middleware('module:proficiency,view');
    Route::get('proficiency/by-section', [\App\Http\Controllers\ProficiencyController::class, 'bySection'])->middleware('module:proficiency,view');
    // RealtimeAttendance GET route
    Route::get('realtime-attendance', [\App\Http\Controllers\RealtimeAttendanceController::class, 'index'])->middleware('module:student-attendance,view');
    // Student RFID Tag routes
    Route::apiResource('student-rfid-tags', StudentRfidTagController::class)->middleware('module:gate-entries,view');
    // RFID Scan Log routes
    Route::post('rfid-scan-logs/scan', [RfidScanLogController::class, 'scan'])->middleware('module:gate-entries,manage');
    Route::get('rfid-scan-logs/class-section-daily', [RfidScanLogController::class, 'classSectionDaily'])->middleware('module:gate-entries,view');
    Route::apiResource('rfid-scan-logs', RfidScanLogController::class)->only(['index', 'store', 'show', 'destroy'])->middleware('module:gate-entries,view');
    // Core Value Marking routes
    Route::apiResource('core-value-markings', CoreValueMarkingController::class)->middleware('module:proficiency,view');
    // SF9 routes
    Route::post('sf9/generate', [SF9Controller::class, 'generate'])->middleware('module:consolidated-grades,view');
    Route::get('sf9/academic-years/{studentId}', [SF9Controller::class, 'getAcademicYears'])->middleware('module:consolidated-grades,view');

    // Certificate routes
    Route::apiResource('certificates', CertificateController::class)->middleware('module:certificate-builder,view');

    // Student ID card template routes
    Route::post('id-card-templates/assets', [IdCardTemplateController::class, 'uploadAsset'])->middleware('module:id-card-builder,manage');
    Route::apiResource('id-card-templates', IdCardTemplateController::class)->middleware('module:id-card-builder,view');

    // HRIS — Attendance logs
    Route::get('attendance/logs', [\App\Http\Controllers\AttendanceLogController::class, 'index'])->middleware('module:attendance-logs,view');

    // HRIS — Staff schedules (templates + assignments)
    Route::get('staff-schedule-assignments', [\App\Http\Controllers\StaffScheduleController::class, 'assignments'])->middleware('module:staff-schedules,view');
    Route::delete('staff-schedule-assignments/{assignmentId}', [\App\Http\Controllers\StaffScheduleController::class, 'unassign'])->middleware('module:staff-schedules,manage');
    Route::post('staff-schedules/{id}/assign', [\App\Http\Controllers\StaffScheduleController::class, 'assign'])->middleware('module:staff-schedules,manage');
    Route::apiResource('staff-schedules', \App\Http\Controllers\StaffScheduleController::class)->middleware('module:staff-schedules,view');

    // HRIS — Staff calendar (holidays, events & suspensions)
    Route::apiResource('staff-calendar-events', \App\Http\Controllers\StaffCalendarEventController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->middleware('module:staff-schedules,view');

    // HRIS — The signed-in staff member's own punches (dashboard timesheet)
    Route::get('my-timesheet', [\App\Http\Controllers\MyTimesheetController::class, 'index']);

    // HRIS — Attendance exception requests (early out, official business, …).
    // Filing and cancelling are things any staff member does for themselves;
    // only the approval side is gated.
    Route::get('staff-attendance-requests', [\App\Http\Controllers\StaffAttendanceRequestController::class, 'index']);
    Route::post('staff-attendance-requests', [\App\Http\Controllers\StaffAttendanceRequestController::class, 'store']);
    Route::post('staff-attendance-requests/{id}/approve', [\App\Http\Controllers\StaffAttendanceRequestController::class, 'approve'])->middleware('module:attendance-requests,approve');
    Route::post('staff-attendance-requests/{id}/disapprove', [\App\Http\Controllers\StaffAttendanceRequestController::class, 'disapprove'])->middleware('module:attendance-requests,approve');
    Route::post('staff-attendance-requests/{id}/cancel', [\App\Http\Controllers\StaffAttendanceRequestController::class, 'cancel']);
    Route::post('staff-attendance-requests/{id}/void', [\App\Http\Controllers\StaffAttendanceRequestController::class, 'void'])->middleware('module:attendance-requests,approve');

    // HRIS — Payroll (compensation settings, deduction types, periods, payslips)
    Route::apiResource('payroll-deduction-types', \App\Http\Controllers\PayrollDeductionTypeController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->middleware('module:payroll,view');
    Route::get('payroll-settings', [\App\Http\Controllers\PayrollSettingController::class, 'show'])->middleware('module:payroll,view');
    Route::put('payroll-settings', [\App\Http\Controllers\PayrollSettingController::class, 'update'])->middleware('module:payroll,manage');
    Route::get('payroll-compensations', [\App\Http\Controllers\PayrollCompensationController::class, 'index'])->middleware('module:payroll,view');
    Route::put('payroll-compensations/{userId}', [\App\Http\Controllers\PayrollCompensationController::class, 'upsert'])->middleware('module:payroll,manage');
    Route::post('payroll-periods/{id}/generate', [\App\Http\Controllers\PayrollPeriodController::class, 'generate'])->middleware('module:payroll,manage');
    // Finalising a period is what publishes payslips to staff — a separate
    // ability from ordinary payroll editing.
    Route::post('payroll-periods/{id}/finalize', [\App\Http\Controllers\PayrollPeriodController::class, 'finalize'])->middleware('module:payroll,release');
    Route::post('payroll-periods/{id}/reopen', [\App\Http\Controllers\PayrollPeriodController::class, 'reopen'])->middleware('module:payroll,release');
    Route::get('payroll-periods/{periodId}/payslips', [\App\Http\Controllers\PayslipController::class, 'indexByPeriod'])->middleware('module:payroll,view');
    Route::get('payroll-periods/{periodId}/sheet', [\App\Http\Controllers\PayslipController::class, 'sheetByPeriod'])->middleware('module:payroll,view');
    Route::get('payroll-periods/{periodId}/report', [\App\Http\Controllers\PayrollReportController::class, 'periodSummary'])->middleware('module:payroll,view');
    Route::apiResource('payroll-periods', \App\Http\Controllers\PayrollPeriodController::class)->middleware('module:payroll,view');
    Route::apiResource('payslip-templates', \App\Http\Controllers\PayslipTemplateController::class)->middleware('module:payroll,view');
    // A staff member opens their own payslip here; the controller checks
    // ownership before falling back to the payroll permission.
    Route::get('payslips/{id}', [\App\Http\Controllers\PayslipController::class, 'show']);
    Route::put('payslips/{id}', [\App\Http\Controllers\PayslipController::class, 'update'])->middleware('module:payroll,manage');
    Route::put('payslips/{id}/days/{dayId}', [\App\Http\Controllers\PayslipController::class, 'updateDay'])->middleware('module:payroll,manage');

    // HRIS — Staff loans. Encoding one is ordinary payroll work; signing it off
    // so it starts coming out of a salary is its own ability.
    Route::get('staff-loans/borrowers', [\App\Http\Controllers\StaffLoanController::class, 'borrowers'])->middleware('module:payroll,view');
    Route::post('staff-loans/quote', [\App\Http\Controllers\StaffLoanController::class, 'quote'])->middleware('module:payroll,manage');
    Route::post('staff-loans/{id}/approve', [\App\Http\Controllers\StaffLoanController::class, 'approve'])->middleware('module:payroll,approve-loan');
    Route::post('staff-loans/{id}/reject', [\App\Http\Controllers\StaffLoanController::class, 'reject'])->middleware('module:payroll,approve-loan');
    Route::post('staff-loans/{id}/cancel', [\App\Http\Controllers\StaffLoanController::class, 'cancel'])->middleware('module:payroll,approve-loan');
    Route::apiResource('staff-loans', \App\Http\Controllers\StaffLoanController::class)
        ->only(['index', 'store', 'show', 'update', 'destroy'])
        ->middleware('module:payroll,view');

    // HRIS — Biometric devices
    Route::get('biometric/devices', [BiometricDeviceController::class, 'index'])->middleware('module:biometric-devices,view');
    Route::post('biometric/devices', [BiometricDeviceController::class, 'store'])->middleware('module:biometric-devices,manage');
    Route::get('biometric/devices/{id}', [BiometricDeviceController::class, 'show'])->middleware('module:biometric-devices,view');
    Route::delete('biometric/devices/{id}', [BiometricDeviceController::class, 'destroy'])->middleware('module:biometric-devices,manage');
    Route::post('biometric/devices/{id}/refresh-pairing-code', [BiometricDeviceController::class, 'refreshPairingCode'])->middleware('module:biometric-devices,manage');
    Route::post('biometric/devices/{id}/fetch-users', [BiometricDeviceController::class, 'fetchUsers'])->middleware('module:biometric-devices,manage');
    Route::post('biometric/devices/{id}/fetch-attendance', [BiometricDeviceController::class, 'fetchAttendance'])->middleware('module:biometric-devices,manage');

    // HRIS — ZK user mappings
    Route::get('biometric/zk-users', [ZkUserMappingController::class, 'index'])->middleware('module:zk-users,view');
    Route::post('biometric/zk-users', [ZkUserMappingController::class, 'store'])->middleware('module:zk-users,manage');
    Route::post('biometric/zk-users/{id}/link', [ZkUserMappingController::class, 'link'])->middleware('module:zk-users,manage');
    Route::delete('biometric/zk-users/{id}/link', [ZkUserMappingController::class, 'unlink'])->middleware('module:zk-users,manage');
    Route::delete('biometric/zk-users/{id}', [ZkUserMappingController::class, 'destroy'])->middleware('module:zk-users,manage');
    Route::post('biometric/zk-users/{id}/enroll', [ZkUserMappingController::class, 'enroll'])->middleware('module:zk-users,manage');
    Route::post('biometric/zk-users/{id}/trigger-fingerprint', [ZkUserMappingController::class, 'triggerFingerprint'])->middleware('module:zk-users,manage');

    // SMS Gateway — kiosk devices
    Route::get('sms/gateways', [SmsGatewayController::class, 'index'])->middleware('module:sms-gateways,view');
    Route::post('sms/gateways', [SmsGatewayController::class, 'store'])->middleware('module:sms-gateways,manage');
    Route::get('sms/gateways/{id}', [SmsGatewayController::class, 'show'])->middleware('module:sms-gateways,view');
    Route::patch('sms/gateways/{id}', [SmsGatewayController::class, 'update'])->middleware('module:sms-gateways,manage');
    Route::delete('sms/gateways/{id}', [SmsGatewayController::class, 'destroy'])->middleware('module:sms-gateways,manage');
    Route::post('sms/gateways/{id}/refresh-pairing-code', [SmsGatewayController::class, 'refreshPairingCode'])->middleware('module:sms-gateways,manage');
    Route::get('sms/gateways/{id}/installer', [SmsGatewayController::class, 'installer'])->middleware('module:sms-gateways,manage');
    // Read-only diagnostics: ask the kiosk to re-check its modem, and watch its log tail.
    Route::post('sms/gateways/{id}/refresh-status', [SmsGatewayController::class, 'refreshStatus'])->middleware('module:sms-gateways,view');
    Route::get('sms/gateways/{id}/logs', [SmsGatewayController::class, 'logs'])->middleware('module:sms-gateways,view');

    // SMS Gateway — messages
    Route::get('sms/messages', [SmsMessageController::class, 'index'])->middleware('module:sms-messages,view');
    Route::post('sms/messages', [SmsMessageController::class, 'store'])->middleware('module:sms-messages,manage');
    Route::get('sms/messages/{id}', [SmsMessageController::class, 'show'])->middleware('module:sms-messages,view');
    Route::post('sms/messages/{id}/retry', [SmsMessageController::class, 'retry'])->middleware('module:sms-messages,manage');
    Route::post('sms/messages/{id}/cancel', [SmsMessageController::class, 'cancel'])->middleware('module:sms-messages,manage');

    // SMS Gateway — settings
    Route::get('sms/settings', [SmsSettingsController::class, 'show'])->middleware('module:sms-settings,view');
    Route::put('sms/settings', [SmsSettingsController::class, 'update'])->middleware('module:sms-settings,manage');

    // SMS Gateway — per-gate (entrance/exit) notification config
    Route::get('sms/gate-settings', [GateSmsSettingController::class, 'index'])->middleware('module:sms-settings,view');
    Route::put('sms/gate-settings/{gateType}', [GateSmsSettingController::class, 'update'])->middleware('module:sms-settings,manage');

    // Announcements
    // Viewer feed (students + staff) — declared before the apiResource so the
    // {announcement} wildcard doesn't swallow these paths.
    Route::get('announcements/feed', [AnnouncementController::class, 'feed']);
    Route::get('announcements/unread-count', [AnnouncementController::class, 'unreadCount']);
    Route::post('announcements/{id}/read', [AnnouncementController::class, 'markRead']);
    // Authoring (teachers + admins)
    Route::post('announcements/{id}/attachments', [AnnouncementController::class, 'uploadAttachment'])->middleware('module:announcements,manage');
    Route::delete('announcements/{id}/attachments/{attachmentId}', [AnnouncementController::class, 'deleteAttachment'])->middleware('module:announcements,manage');
    Route::apiResource('announcements', AnnouncementController::class)->middleware('module:announcements,view,shared');

    // Online admission form submissions (admin list/detail/accept/reject)
    Route::get('admission-form-settings', [AdmissionFormSubmissionController::class, 'settings'])->middleware('module:admission-forms,view');
    Route::put('admission-form-settings', [AdmissionFormSubmissionController::class, 'updateSettings'])->middleware('module:admission-forms,manage');
    Route::get('admission-form-submissions', [AdmissionFormSubmissionController::class, 'index'])->middleware('module:admission-forms,view');
    Route::get('admission-form-submissions/{id}', [AdmissionFormSubmissionController::class, 'show'])->middleware('module:admission-forms,view');
    Route::post('admission-form-submissions/{id}/accept', [AdmissionFormSubmissionController::class, 'accept'])->middleware('module:admission-forms,manage');
    Route::post('admission-form-submissions/{id}/create-student', [AdmissionFormSubmissionController::class, 'createStudent'])->middleware('module:students,manage');
    Route::post('admission-form-submissions/{id}/reject', [AdmissionFormSubmissionController::class, 'reject'])->middleware('module:admission-forms,manage');
});

Route::get('/health', function () {
    return response()->json([
        'status' => 'healthy',
        'timestamp' => now(),
        'version' => config('app.version', '1.0.0'),
    ]);
});
