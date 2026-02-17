<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'service' => 'schoolmate-payments',
        'status' => 'ok',
        'message' => 'Payment service. Use API routes.',
    ]);
});
