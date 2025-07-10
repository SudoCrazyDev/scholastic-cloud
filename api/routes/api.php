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
    Route::apiResource('users', UserController::class);
    // Staff routes
    Route::apiResource('staffs', StaffController::class);
    Route::put('staffs/{id}/role', [StaffController::class, 'updateRole']);
    // ClassSection routes
    Route::apiResource('class-sections', ClassSectionController::class);
});