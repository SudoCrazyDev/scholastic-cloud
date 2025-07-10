<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\InstitutionController;

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

// Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
//     return $request->user();
// });

// Role routes
Route::apiResource('roles', RoleController::class);

// Subscription routes
Route::apiResource('subscriptions', SubscriptionController::class);

// Institution routes
Route::apiResource('institutions', InstitutionController::class);
Route::post('institutions/{id}/logo', [InstitutionController::class, 'uploadLogo']);
Route::get('institutions/subscriptions/list', [InstitutionController::class, 'getSubscriptions']); 