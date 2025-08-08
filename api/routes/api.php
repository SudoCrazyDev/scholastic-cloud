<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\InstitutionController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\ClassSectionController;
use App\Http\Controllers\SubjectController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\StudentSectionController;
use App\Http\Controllers\StudentEcrItemScoreController;
use App\Http\Controllers\SectionConsolidatedGradesController;
use App\Http\Controllers\UserAddressController;
use App\Http\Controllers\UserWorkExperienceController;
use App\Http\Controllers\CoreValueMarkingController;
use App\Http\Controllers\SF9Controller;

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

// Public routes (no authentication required)
Route::post('/login', [AuthController::class, 'login']);

// Protected routes (authentication required)
Route::middleware('auth.token')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/profile', [AuthController::class, 'profile']);
    Route::put('/profile/password', [AuthController::class, 'updatePassword']);
    // Role routes
    Route::apiResource('roles', RoleController::class);
    // Subscription routes
    Route::apiResource('subscriptions', SubscriptionController::class);
    // Institution routes
    Route::apiResource('institutions', InstitutionController::class);
    Route::post('institutions/{id}/logo', [InstitutionController::class, 'uploadLogo']);
    Route::get('institutions/subscriptions/list', [InstitutionController::class, 'getSubscriptions']);
    // User routes
    Route::get('users/my/class-sections', [UserController::class, 'getMyClassSections']);
    Route::get('users/my/subjects', [UserController::class, 'getMySubjects']);
    Route::apiResource('users', UserController::class);
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
    Route::post('students/exists', [App\Http\Controllers\StudentController::class, 'exists']);
    Route::get('students/search-for-assignment', [StudentController::class, 'searchForAssignment']);
    Route::apiResource('students', StudentController::class);
    // Staff routes
    Route::put('staffs/{id}/role', [StaffController::class, 'updateRole']);
    Route::post('staffs/{id}/reset-password', [StaffController::class, 'resetPassword']);
    Route::apiResource('staffs', StaffController::class);
    // ClassSection routes
    Route::get('class-sections/by-institution/{institutionId?}', [ClassSectionController::class, 'getByInstitution']);
    Route::apiResource('class-sections', ClassSectionController::class);
    // Subject routes
    Route::apiResource('subjects', SubjectController::class);
    Route::post('subjects/reorder', [SubjectController::class, 'reorder']);
    // Topic routes
    Route::get('topics', [App\Http\Controllers\TopicController::class, 'index']);
    Route::post('topics', [App\Http\Controllers\TopicController::class, 'store']);
    Route::get('topics/{id}', [App\Http\Controllers\TopicController::class, 'show']);
    Route::put('topics/{id}', [App\Http\Controllers\TopicController::class, 'update']);
    Route::patch('topics/{id}', [App\Http\Controllers\TopicController::class, 'update']);
    Route::delete('topics/{id}', [App\Http\Controllers\TopicController::class, 'destroy']);
    Route::post('topics/reorder', [App\Http\Controllers\TopicController::class, 'reorder']);
    Route::patch('topics/{id}/toggle-completion', [App\Http\Controllers\TopicController::class, 'toggleCompletion']);
    // SubjectEcr routes
    Route::apiResource('subjects-ecr', App\Http\Controllers\SubjectEcrController::class);
    Route::apiResource('subjects-ecr-items', App\Http\Controllers\SubjectEcrItemController::class);
    // SubjectSummativeAssessment routes
    Route::apiResource('subject-summative-assessments', \App\Http\Controllers\SubjectSummativeAssessmentController::class);
    // StudentSection routes
    Route::apiResource('student-sections', StudentSectionController::class);
    Route::post('student-sections/bulk-assign', [StudentSectionController::class, 'bulkAssign']);
    // StudentEcrItemScore routes
    Route::get('student-ecr-item-scores/by-subject-section', [StudentEcrItemScoreController::class, 'getScoresBySubjectAndSection']);
    Route::get('student-ecr-item-scores/by-student-subject', [StudentEcrItemScoreController::class, 'getByStudentAndSubject']);
    Route::apiResource('student-ecr-item-scores', StudentEcrItemScoreController::class);
    // StudentRunningGrade routes
    Route::apiResource('student-running-grades', \App\Http\Controllers\StudentRunningGradeController::class);
    Route::post('student-running-grades/upsert-final-grade', [\App\Http\Controllers\StudentRunningGradeController::class, 'upsertFinalGrade']);
    // Section Consolidated Grades route
    Route::get('section-consolidated-grades', [SectionConsolidatedGradesController::class, 'index']);
    // RealtimeAttendance GET route
    Route::get('realtime-attendance', [\App\Http\Controllers\RealtimeAttendanceController::class, 'index']);
    // Core Value Marking routes
    Route::apiResource('core-value-markings', CoreValueMarkingController::class);
    // SF9 routes
    Route::post('sf9/generate', [SF9Controller::class, 'generate']);
    Route::get('sf9/academic-years/{studentId}', [SF9Controller::class, 'getAcademicYears']);
});

Route::get('/health', function () {
    return response()->json([
        'status' => 'healthy',
        'timestamp' => now(),
        'version' => config('app.version', '1.0.0')
    ]);
});