<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    /*
     * `Date` is not a CORS-safelisted response header, so without this a
     * cross-origin `response.headers.get('Date')` is silently null. The gate
     * kiosk reads it on every reply to correct its own clock — a Raspberry Pi
     * has no RTC, and a wrong wall-clock day in `rfid_scan_logs` is not
     * recoverable after the fact. Exposing it costs nothing: the header is sent
     * on every response regardless; this only lets script read what is already
     * there.
     *
     * `ETag` is the same story: the kiosk keys its cached faces by the content
     * hash the photo endpoint returns there, and an unreadable header sends it
     * back to guessing.
     */
    'exposed_headers' => ['Date', 'ETag'],

    'max_age' => 0,

    'supports_credentials' => false,

];
