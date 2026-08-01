<?php

/*
|--------------------------------------------------------------------------
| Tala — the AI teaching assistant
|--------------------------------------------------------------------------
|
| Tala is a chat module. Unlike the lesson planner in config/ai.php, which
| runs on one platform-wide key read from the environment, Tala runs on keys
| a tenant supplies: an institution-wide key its administrator sets, and a
| teacher's own key as the fallback when the school has not set one.
|
| Nothing here holds a credential. This file only says which providers and
| models a tenant may point a key at, so a teacher cannot name an arbitrary
| model string and a school cannot be billed for a tier it did not choose.
|
*/

return [

    /*
    |--------------------------------------------------------------------------
    | Provider catalog
    |--------------------------------------------------------------------------
    |
    | `models` is an allowlist. A credential naming a model outside its
    | provider's list is rejected on the way in, and a stored model that later
    | disappears from the list falls back to `default_model`.
    |
    */
    'default_provider' => env('TALA_DEFAULT_PROVIDER', 'anthropic'),

    'providers' => [

        'anthropic' => [
            'label' => 'Claude (Anthropic)',
            'base_url' => env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
            'default_model' => 'claude-opus-5',
            'key_hint' => 'Starts with sk-ant-',
            'console_url' => 'https://platform.claude.com/settings/keys',
            'models' => [
                'claude-opus-5' => [
                    'label' => 'Claude Opus 5',
                    'description' => 'Most capable. Best for lesson design and long, involved questions.',
                ],
                'claude-sonnet-5' => [
                    'label' => 'Claude Sonnet 5',
                    'description' => 'Faster and cheaper, close to Opus on everyday teaching work.',
                ],
                'claude-haiku-4-5' => [
                    'label' => 'Claude Haiku 4.5',
                    'description' => 'Cheapest and quickest. Good for short questions and drafting.',
                ],
            ],
        ],

        'openai' => [
            'label' => 'ChatGPT (OpenAI)',
            'base_url' => env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
            'default_model' => 'gpt-4.1',
            'key_hint' => 'Starts with sk-',
            'console_url' => 'https://platform.openai.com/api-keys',
            'models' => [
                'gpt-4.1' => [
                    'label' => 'GPT-4.1',
                    'description' => 'General purpose, strong on long documents.',
                ],
                'gpt-4.1-mini' => [
                    'label' => 'GPT-4.1 mini',
                    'description' => 'Cheaper and quicker, for short questions and drafting.',
                ],
            ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Generation
    |--------------------------------------------------------------------------
    |
    | `effort` is Anthropic-only and is how Tala keeps chat responsive: thinking
    | stays on (disabling it on Opus 5 makes the model leak reasoning into the
    | visible reply) and depth is dialled down instead.
    |
    | `max_tokens` is a hard ceiling covering thinking *and* the reply, so it
    | has to leave room for both.
    |
    */
    'effort' => env('TALA_EFFORT', 'medium'),
    'max_tokens' => (int) env('TALA_MAX_TOKENS', 8000),
    'request_timeout' => (int) env('TALA_REQUEST_TIMEOUT', 180),

    /*
    | How many past turns are replayed to the model. The whole conversation is
    | kept in the database; this only bounds what each request pays for.
    */
    'max_history_messages' => (int) env('TALA_MAX_HISTORY', 30),

    /*
    | Longest single message a teacher may send, in characters. Guards against
    | someone pasting a whole textbook into a school-funded key.
    */
    'max_message_length' => (int) env('TALA_MAX_MESSAGE_LENGTH', 16000),

    /*
    |--------------------------------------------------------------------------
    | Spend guard
    |--------------------------------------------------------------------------
    |
    | Applies only to the institution-wide key, where one teacher's usage is
    | spending everyone's budget. A teacher on their own key is spending their
    | own money and is not capped.
    |
    | Months are counted in `timezone`, not UTC: the API runs on UTC (see
    | config/app.php) while the schools do not, and a cap that resets at 8am
    | local would be its own bug report.
    |
    */
    'default_monthly_message_limit' => (int) env('TALA_MONTHLY_MESSAGE_LIMIT', 300),
    'timezone' => 'Asia/Manila',

];
