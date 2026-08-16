<?php

/*
|--------------------------------------------------------------------------
| Chat realtime
|--------------------------------------------------------------------------
|
| Settings for the Cloudflare Worker that delivers group-chat messages
| (microservices/chat-realtime). Every value is optional: with none of them set,
| chat still works and the client falls back to polling /chat/sync. Realtime is
| a speed-up, never a dependency.
|
| CHAT_TENANT identifies this deployment to the shared Worker. It must match a
| key in the Worker's CHAT_TENANTS secret, and CHAT_WORKER_SECRET must match
| that entry's secret — the pair is what keeps one school's sockets out of
| another's.
|
*/

return [

    'tenant' => env('CHAT_TENANT'),

    'worker' => [
        /** Base URL of the Worker, e.g. https://scholastic-chat-realtime.<account>.workers.dev */
        'url' => env('CHAT_WORKER_URL'),

        'secret' => env('CHAT_WORKER_SECRET'),

        /*
         * Deliberately short. This call sits inline on the request that posts a
         * message — it cannot be queued, because no deployment runs a queue
         * worker reliably and a message delivered a minute late is not realtime.
         * So it is given two seconds and its failure is ignored: the client's
         * next sync poll carries the message regardless.
         */
        'timeout' => (float) env('CHAT_WORKER_TIMEOUT', 2),
    ],

    /*
     * Lifetime of a socket token, in seconds. Short because it travels in the
     * WebSocket URL — a browser cannot set headers on the handshake. It is only
     * needed for the moment of connecting.
     */
    'socket_token_ttl' => (int) env('CHAT_SOCKET_TOKEN_TTL', 300),

    /*
     * Lifetime of the chat access token, in seconds. Longer than the socket
     * ticket because the client carries it on every request, and refreshing it
     * is the only chat traffic Laravel still sees — at fifteen minutes and 1,500
     * concurrent users that is under two requests a second.
     *
     * A long life is safe here because the token settles identity only. The
     * service checks the roster on each request, so access ends when membership
     * does rather than when the token runs out.
     */
    'access_token_ttl' => (int) env('CHAT_ACCESS_TOKEN_TTL', 900),

];
