<?php

use App\Http\Controllers\IClockController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| ZKTeco ADMS (iClock) routes
|--------------------------------------------------------------------------
| These routes have NO /api/ prefix — the device is configured with
| Server Address = <your-host> and automatically appends /iclock/*.
|
| Device ADMS settings:
|   Server Mode:    ADMS
|   Server Address: your-api-domain (e.g. 192.168.1.x or app.domain.com)
|   Server Port:    8000 (or 80/443)
*/

Route::get('/cdata',     [IClockController::class, 'init']);
Route::post('/cdata',    [IClockController::class, 'upload']);
Route::get('/getrequest', [IClockController::class, 'getRequest']);
Route::post('/devicecmd', [IClockController::class, 'deviceCmd']);
