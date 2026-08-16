/**
 * Chat service – Cloudflare Worker, Durable Objects and D1
 *
 * Owns every chat read and write for every ScholasticCloud deployment. Laravel
 * keeps the academic records that group membership is derived from, hands out
 * identity tokens, and pushes a roster whenever enrolment changes — and is
 * otherwise not in the path of anything a student or teacher does here.
 *
 * That split exists because the API is deployed by unzipping onto shared
 * hosting. A poll from every open tab was the load that made chat unviable
 * there; moving the reads to the edge is the whole point of this service.
 *
 * Client routes — bearer is the chat token Laravel signed:
 *   GET  /v1/conversations
 *   GET  /v1/conversations/:id/messages?before=
 *   POST /v1/conversations/:id/messages
 *   POST /v1/conversations/:id/messages/:mid/delete
 *   POST /v1/conversations/:id/read
 *   POST /v1/conversations/:id/lock   { locked: bool }   teacher only
 *   GET  /v1/sync?since=
 *   GET  /v1/unread-count
 *   GET  /v1/push/key                 VAPID public key, or null when push is off
 *   POST /v1/push/subscribe
 *   POST /v1/push/unsubscribe
 *   GET  /connect?token=              WebSocket
 *
 * Server routes — bearer is the tenant secret:
 *   POST /internal/rosters            one group's membership, version stamped
 *   POST /internal/publish            legacy relay, kept for the Laravel path
 *
 * Cron: asks each tenant for a full roster snapshot.
 */
import { ChatInbox } from './inbox.js'
import { authorizeTenantCall, tenantConfig, tenantDb, tenants, verifyToken } from './auth.js'
import { sendPush, vapidKeys } from './push.js'
import {
  applyRoster,
  deleteMessage,
  forgetSubscription,
  forgetSubscriptions,
  insertMessage,
  listConversations,
  listMessages,
  markRead,
  messageIn,
  participantFor,
  recipientsExcept,
  saveSubscription,
  serializeMessage,
  setLocked,
  subscriptionsFor,
  sync,
  unreadTotal,
} from './store.js'

export { ChatInbox }

/*
 * A Worker invocation may hold only six connections at a time waiting for
 * response headers, so the fan-out is issued six at a time. Going wider does not
 * make it faster — the extra calls queue behind the limit anyway.
 *
 * Up to two subrequests per recipient — the Durable Object call, and a push if
 * that recipient turned out to have no socket — against a budget of 10,000 on
 * the paid plan and 50 on free. A class-sized group is nowhere near the former;
 * the free plan's 50 is the one a large section could actually reach.
 */
const FANOUT_BATCH = 6

const MAX_BODY = 4000

/** Thirty a minute per person: invisible when typing, a cap on a flood. */
const SEND_LIMIT = 30
const SEND_WINDOW_MS = 60_000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

const ok = data => json({ success: true, data })
const fail = (message, status) => json({ success: false, message }, status)

/**
 * Deliberately the same answer whether the group is missing or simply not
 * theirs — otherwise this endpoint reports which conversation ids exist to
 * anyone willing to iterate.
 */
const notAMember = () => fail('Conversation not found', 404)

function inboxStub(env, tenantId, type, id) {
  // The tenant prefix keeps schools apart; two deployments can hold the same
  // uuid and must never land in the same object. The participant type is there
  // because staff and students are drawn from separate id spaces.
  const name = `${tenantId}:${type}:${id}`
  return env.CHAT_INBOX.get(env.CHAT_INBOX.idFromName(name), { locationHint: 'apac' })
}

/**
 * Push a message to everyone connected, six calls at a time.
 *
 * Reports back who had no socket open, because that is the set Web Push exists
 * for — and it is knowable here and nowhere else. The inbox object either held a
 * live connection or it did not; nothing upstream can tell.
 */
async function fanOut(env, tenantId, conversationId, message, recipients) {
  if (!recipients.length) return { delivered: 0, offline: [] }

  const envelope = JSON.stringify({ type: 'message', conversation_id: conversationId, message })

  let delivered = 0
  const offline = []

  for (let i = 0; i < recipients.length; i += FANOUT_BATCH) {
    const batch = recipients.slice(i, i + FANOUT_BATCH)

    const results = await Promise.allSettled(
      batch.map(person =>
        inboxStub(env, tenantId, person.type, person.id)
          .fetch(new Request('https://inbox/deliver', { method: 'POST', body: envelope }))
          .then(response => response.json()),
      ),
    )

    results.forEach((result, index) => {
      const sockets = result.status === 'fulfilled' ? Number(result.value?.delivered || 0) : 0

      if (sockets > 0) delivered += sockets
      // An object that failed to answer counts as offline too: better a
      // duplicate notification than a silent one.
      else offline.push(batch[index])
    })
  }

  return { delivered, offline }
}

/** What a notification says. Short enough to read on a lock screen. */
const PREVIEW_LENGTH = 120

/**
 * Notify the people who were not connected.
 *
 * Runs after the response has gone back to the sender — a push service can take
 * a second to answer, and nobody typing should wait on the delivery to somebody
 * else's phone. Anything that fails here is not retried: the message is already
 * saved, and the recipient will see it the moment they open the app.
 */
async function notifyOffline(env, db, conversation, message, offline) {
  const keys = vapidKeys(env)
  if (!keys) return

  // Muting a group means muting the interruption, not the message.
  const targets = offline.filter(person => !person.muted_at)
  if (!targets.length) return

  const subscriptions = await subscriptionsFor(db, targets)
  if (!subscriptions.length) return

  const payload = JSON.stringify({
    title: conversation.title,
    body: `${message.sender_name ?? 'Someone'}: ${String(message.body).slice(0, PREVIEW_LENGTH)}`,
    conversation_id: message.conversation_id,
    // One notification per group, replaced as it goes — three messages in a
    // class group should not be three entries in a shade.
    tag: `chat:${message.conversation_id}`,
    url: `/chat?c=${encodeURIComponent(message.conversation_id)}`,
  })

  const dead = []

  for (let i = 0; i < subscriptions.length; i += FANOUT_BATCH) {
    const batch = subscriptions.slice(i, i + FANOUT_BATCH)
    const results = await Promise.all(batch.map(sub => sendPush(sub, payload, keys)))

    results.forEach((result, index) => {
      if (result.gone) dead.push(batch[index].endpoint)
    })
  }

  // The browser threw these away — uninstalled, cleared, or permission revoked.
  // Left in place they would be retried on every message forever.
  await forgetSubscriptions(db, dead)
}

/**
 * Rate limit, held in the sender's own Durable Object.
 *
 * Deliberately not in D1: a counter written on every message would be a write
 * to the one database every read also queues behind, and the limit is per
 * person — which is exactly the object that already exists per person.
 */
async function withinSendLimit(env, tenantId, principal) {
  const stub = inboxStub(env, tenantId, principal.participant_type, principal.participant_id)

  const response = await stub.fetch(
    new Request('https://inbox/rate', {
      method: 'POST',
      body: JSON.stringify({ limit: SEND_LIMIT, windowMs: SEND_WINDOW_MS }),
    }),
  )

  const { allowed } = await response.json()
  return allowed
}

/* ===================== client routes ===================== */

async function handleClient(request, env, url, claims, ctx) {
  const db = tenantDb(env, claims.tenant)
  if (!db) return fail('Chat storage is not configured for this school', 503)

  const path = url.pathname.replace(/^\/v1/, '')

  /*
   * The key a browser needs before it can subscribe. Handed out rather than
   * configured on both sides, so a deployment cannot end up with an app holding
   * one key and the sender holding another — a mismatch the push service reports
   * only as a flat rejection.
   */
  if (request.method === 'GET' && path === '/push/key') {
    return ok({ key: vapidKeys(env)?.publicKey ?? null })
  }

  if (request.method === 'POST' && path === '/push/subscribe') {
    if (!vapidKeys(env)) return fail('Notifications are not enabled on this service', 503)

    let payload
    try {
      payload = await request.json()
    } catch {
      return fail('Invalid JSON', 400)
    }

    const endpoint = String(payload.endpoint || '')
    const p256dh = String(payload.keys?.p256dh || '')
    const auth = String(payload.keys?.auth || '')

    if (!endpoint.startsWith('https://') || !p256dh || !auth) {
      return fail('Incomplete push subscription', 422)
    }

    await saveSubscription(db, claims, { endpoint, p256dh, auth })
    return ok(null)
  }

  if (request.method === 'POST' && path === '/push/unsubscribe') {
    let payload
    try {
      payload = await request.json()
    } catch {
      return fail('Invalid JSON', 400)
    }

    // Scoped to the caller, not just the endpoint: turning off your own
    // notifications should never be a way to turn off somebody else's, even
    // given their device address.
    if (payload.endpoint) await forgetSubscription(db, claims, String(payload.endpoint))
    return ok(null)
  }

  if (request.method === 'GET' && path === '/conversations') {
    return ok(await listConversations(db, claims))
  }

  if (request.method === 'GET' && path === '/sync') {
    return ok(await sync(db, claims, url.searchParams.get('since')))
  }

  if (request.method === 'GET' && path === '/unread-count') {
    return ok({ count: await unreadTotal(db, claims) })
  }

  const conversationMatch = path.match(/^\/conversations\/([^/]+)\/(messages|read|lock)$/)
  const moderationMatch = path.match(/^\/conversations\/([^/]+)\/messages\/([^/]+)\/delete$/)

  /*
   * Removing a message.
   *
   * A teacher may remove anything in a group they still belong to; anyone may
   * remove their own. Both go through the same rule rather than two endpoints,
   * because they are the same act with the same consequence — the text is gone
   * from every screen and the tombstone stays.
   */
  if (request.method === 'POST' && moderationMatch) {
    const [, conversationId, messageId] = moderationMatch

    const participant = await participantFor(db, conversationId, claims)
    if (!participant) return notAMember()

    // Someone who has left the section is not a moderator of it any more.
    if (participant.removed_at) return fail('You are no longer a member of this group', 403)

    const message = await messageIn(db, conversationId, messageId)
    if (!message) return fail('Message not found', 404)

    const isOwn =
      message.sender_type === claims.participant_type &&
      message.sender_id === claims.participant_id

    if (participant.role !== 'teacher' && !isOwn) {
      return fail('Only a teacher can remove someone else’s message', 403)
    }

    const removed = await deleteMessage(db, conversationId, messageId, claims)

    // Already a tombstone. Two teachers reaching for the same message should
    // both see it gone, not one of them see an error.
    if (!removed) return ok(serializeMessage(message))

    // Straight to every open screen. Without this the text stays visible until
    // whenever each client next polls, which is the one thing removal is for.
    const tombstone = serializeMessage(removed)
    const recipients = await recipientsExcept(db, conversationId, claims)
    ctx?.waitUntil(fanOut(env, claims.tenant, conversationId, tombstone, recipients))

    return ok(tombstone)
  }

  if (conversationMatch) {
    const [, conversationId, action] = conversationMatch

    // Membership is the authorization, and it is re-read here on every single
    // request. The token proved who they are and nothing else, which is why a
    // student removed from a section loses access at once rather than when it
    // expires.
    const participant = await participantFor(db, conversationId, claims)
    if (!participant) return notAMember()

    if (request.method === 'GET' && action === 'messages') {
      return ok(await listMessages(db, conversationId, url.searchParams.get('before')))
    }

    if (request.method === 'POST' && action === 'read') {
      await markRead(db, conversationId, claims)
      return ok(null)
    }

    /*
     * Closing a group to new messages.
     *
     * The teacher's blunt instrument, and the reason it is blunt is that it is
     * reversible and affects nobody's history: the transcript stays readable to
     * everyone, only the composer closes. A teacher who has left the section
     * cannot use it.
     */
    if (request.method === 'POST' && action === 'lock') {
      if (participant.role !== 'teacher' || participant.removed_at) {
        return fail('Only a teacher of this group can close it', 403)
      }

      let payload
      try {
        payload = await request.json()
      } catch {
        return fail('Invalid JSON', 400)
      }

      await setLocked(db, conversationId, !!payload.locked)
      return ok({ locked: !!payload.locked })
    }

    if (request.method === 'POST' && action === 'messages') {
      // Removed from the section or subject: the history stays readable, the
      // composer does not.
      if (participant.removed_at) return fail('You are no longer a member of this group', 403)
      if (participant.locked_at) return fail('This group is closed to new messages', 403)

      let payload
      try {
        payload = await request.json()
      } catch {
        return fail('Invalid JSON', 400)
      }

      const body = String(payload.body ?? '').trim()
      if (!body) return fail('Message cannot be empty', 422)
      if (body.length > MAX_BODY) return fail(`Message is longer than ${MAX_BODY} characters`, 422)

      if (!(await withinSendLimit(env, claims.tenant, claims))) {
        return fail('You are sending messages too quickly. Wait a moment.', 429)
      }

      const message = await insertMessage(db, conversationId, claims, body)
      if (!message) return notAMember()

      // Best effort. Anyone not connected picks it up from /sync.
      const recipients = await recipientsExcept(db, conversationId, claims)
      const { offline } = await fanOut(env, claims.tenant, conversationId, message, recipients)

      // Whoever had no socket gets a notification instead — after the sender has
      // their 201, because a push service answering slowly is not their problem.
      ctx?.waitUntil(
        notifyOffline(env, db, { title: participant.conversation_title }, message, offline),
      )

      return json({ success: true, data: message }, 201)
    }
  }

  return fail('Not found', 404)
}

/* ===================== websocket ===================== */

async function handleConnect(request, env, url) {
  // A browser cannot set headers on a WebSocket handshake, so the token rides
  // in the query string. It is minted per connection and lives five minutes.
  const claims = await verifyToken(url.searchParams.get('token'), env)
  if (!claims) return new Response('Unauthorized', { status: 401 })

  return inboxStub(env, claims.tenant, claims.participant_type, claims.participant_id).fetch(
    new Request('https://inbox/connect', { headers: { Upgrade: 'websocket' } }),
  )
}

/* ===================== server-to-server ===================== */

async function handleRosters(request, env) {
  const caller = authorizeTenantCall(request, env)
  if (!caller) return fail('Unauthorized', 401)

  const db = tenantDb(env, caller.id)
  if (!db) return fail('No database bound for this tenant', 503)

  let payload
  try {
    payload = await request.json()
  } catch {
    return fail('Invalid JSON', 400)
  }

  // A snapshot arrives as a list; a single change arrives as one entry. Same
  // path either way, so the repair pass and the live push cannot drift apart.
  const batch = Array.isArray(payload.rosters) ? payload.rosters : [payload]
  const results = []

  for (const roster of batch) {
    if (!roster?.conversation?.id) continue
    results.push(await applyRoster(db, roster))
  }

  return ok({
    received: batch.length,
    applied: results.filter(r => r.applied).length,
    stale: results.filter(r => !r.applied).length,
  })
}

/** The phase 2 relay. Kept so a tenant still serving chat from Laravel works. */
async function handlePublish(request, env) {
  const caller = authorizeTenantCall(request, env)
  if (!caller) return fail('Unauthorized', 401)

  let body
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON', 400)
  }

  const recipients = Array.isArray(body.recipients) ? body.recipients : []
  const { delivered } = await fanOut(env, caller.id, body.conversation_id, body.message, recipients)

  // No push on this path: a tenant still serving chat from Laravel has no
  // subscriptions here to send to, because the app never talked to this service.
  return json({ delivered, recipients: recipients.length })
}

/* ===================== entry ===================== */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    if (url.pathname === '/connect') return handleConnect(request, env, url)
    if (url.pathname === '/internal/rosters' && request.method === 'POST')
      return handleRosters(request, env)
    if (url.pathname === '/internal/publish' && request.method === 'POST')
      return handlePublish(request, env)

    if (url.pathname === '/') {
      return json({ service: 'scholastic-chat', tenants: Object.keys(tenants(env)).length })
    }

    if (url.pathname.startsWith('/v1/')) {
      const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      const claims = await verifyToken(bearer, env)
      if (!claims) return fail('Invalid or expired chat token', 401)

      return handleClient(request, env, url, claims, ctx)
    }

    return fail('Not found', 404)
  },

  /**
   * Ask every tenant for a full roster snapshot.
   *
   * Membership is pushed as it changes, and those pushes cover every write path
   * there is. This exists because the failure mode is silent: a student left out
   * of their class group has no way to tell that they are missing one. Applying
   * a snapshot that changes nothing costs a few queries.
   */
  async scheduled(event, env, ctx) {
    const work = Object.entries(tenants(env)).map(async ([id, tenant]) => {
      if (!tenant.api) return

      try {
        const response = await fetch(`${tenant.api.replace(/\/$/, '')}/chat/roster-snapshot`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tenant.secret}`,
            'X-Chat-Tenant': id,
            'Content-Type': 'application/json',
          },
        })

        console.log(`snapshot ${id}: ${response.status}`)
      } catch (error) {
        console.error(`snapshot ${id} failed: ${error.message}`)
      }
    })

    ctx.waitUntil(Promise.allSettled(work))
  },
}
