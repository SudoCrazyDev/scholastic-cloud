<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\PaymentController;

Route::get('/', function () {
    return response()->json(['service' => 'schoolmate-payments', 'version' => '1.0']);
});

// Payment service routes (main API will call these internally)
Route::prefix('v1')->group(function () {
    Route::post('/charges', [PaymentController::class, 'createCharge']);
    Route::get('/charges/{id}', [PaymentController::class, 'showCharge']);
    Route::post('/webhooks/stripe', [PaymentController::class, 'stripeWebhook']);
});
