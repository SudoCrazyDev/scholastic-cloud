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
use App\Http\Controllers\SubjectEcrController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\StudentSectionController;

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
    // SubjectEcr routes
    Route::apiResource('subjects-ecr', SubjectEcrController::class);
    // StudentSection routes
    Route::apiResource('student-sections', StudentSectionController::class);
    Route::post('student-sections/bulk-assign', [StudentSectionController::class, 'bulkAssign']);
});