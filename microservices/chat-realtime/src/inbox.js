/**
 * One Durable Object per person — their inbox.
 *
 * The alternative was an object per conversation, which sounds more natural and
 * is the wrong shape here: a WebSocket connects to exactly one Durable Object,
 * and a student sits in an advisory plus eight or so subjects. Per-conversation
 * objects would mean nine sockets open on a school tablet. Per-person means one
 * socket, and the fan-out cost moves to the publisher — which is cheap, because
 * Laravel already knows the recipient list.
 *
 * The socket is deliberately one-way. Nothing a client sends here is ever
 * treated as a message: posting goes through the API, where membership, rate
 * limits and the database live. A socket that could write would be a second,
 * unguarded door into the same room.
 */
export class ChatInbox {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/connect') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 })
      }

      const [client, server] = Object.values(new WebSocketPair())

      /*
       * Hibernation, and the reason this is affordable. Handing the socket to
       * the runtime rather than holding a reference lets the object be evicted
       * from memory while the connection stays open — a school is idle for
       * eighteen hours a day, and without this it would be billed for all of
       * them.
       */
      this.state.acceptWebSocket(server)

      return new Response(null, { status: 101, webSocket: client })
    }

    /*
     * Send rate limit, counted here rather than in D1.
     *
     * The limit is per person, and this object is already per person — so the
     * counter lives where it belongs and costs nothing. Putting it in D1 would
     * add a write, on every message, to the one database every read also queues
     * behind.
     */
    if (url.pathname === '/rate' && request.method === 'POST') {
      const { limit, windowMs } = await request.json()
      const now = Date.now()

      const window = (await this.state.storage.get('rate')) || { start: 0, count: 0 }

      if (now - window.start >= windowMs) {
        window.start = now
        window.count = 0
      }

      window.count++
      await this.state.storage.put('rate', window)

      return Response.json({ allowed: window.count <= limit })
    }

    if (url.pathname === '/deliver' && request.method === 'POST') {
      const payload = await request.text()
      const sockets = this.state.getWebSockets()

      let delivered = 0
      for (const socket of sockets) {
        try {
          socket.send(payload)
          delivered++
        } catch {
          // A socket mid-close. The client will fill the gap from /chat/sync
          // when it reconnects, so there is nothing to recover here.
        }
      }

      return Response.json({ delivered })
    }

    return new Response('Not found', { status: 404 })
  }

  webSocketMessage(ws, message) {
    // The heartbeat, and the only thing a client may say. Everything else is
    // ignored rather than answered.
    if (message === 'ping') {
      ws.send('pong')
    }
  }

  webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason)
    } catch {
      // Already gone.
    }
  }

  webSocketError(ws) {
    try {
      ws.close(1011, 'socket error')
    } catch {
      // Already gone.
    }
  }
}
