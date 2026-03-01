<?php

return [
    'service' => [
        'base_url' => env('PAYMENTS_SERVICE_BASE_URL', 'http://localhost:8001/api'),
        'internal_token' => env('PAYMENTS_SERVICE_INTERNAL_TOKEN'),
        'timeout' => (int) env('PAYMENTS_SERVICE_TIMEOUT', 15),
    ],
    'callback' => [
        'token' => env('PAYMENTS_CALLBACK_TOKEN'),
    ],
];
