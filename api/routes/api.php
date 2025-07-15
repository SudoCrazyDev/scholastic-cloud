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
use App\Http\Controllers\UserAddressController;
use App\Http\Controllers\UserWorkExperienceController;

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
    Route::apiResource('staffs', StaffController::class);
    Route::put('staffs/{id}/role', [StaffController::class, 'updateRole']);
    // ClassSection routes
    Route::apiResource('class-sections', ClassSectionController::class);
    // Subject routes
    Route::apiResource('subjects', SubjectController::class);
    Route::post('subjects/reorder', [SubjectController::class, 'reorder']);
    // StudentSection routes
    Route::apiResource('student-sections', StudentSectionController::class);
    Route::post('student-sections/bulk-assign', [StudentSectionController::class, 'bulkAssign']);
    // StudentEcrItemScore routes
    Route::apiResource('student-ecr-item-scores', StudentEcrItemScoreController::class);
    // RealtimeAttendance GET route
    Route::get('realtime-attendance', [\App\Http\Controllers\RealtimeAttendanceController::class, 'index']);
});