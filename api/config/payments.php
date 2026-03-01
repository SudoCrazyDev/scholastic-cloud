<?php

return [
    'maya' => [
        'base_url' => env('MAYA_BASE_URL', 'https://pg-sandbox.paymaya.com'),
        'public_key' => env('MAYA_PUBLIC_KEY'),
        'secret_key' => env('MAYA_SECRET_KEY'),
        'webhook_signature_key' => env('MAYA_WEBHOOK_SIGNATURE_KEY'),
        'timeout' => (int) env('MAYA_TIMEOUT', 20),
    ],
];
