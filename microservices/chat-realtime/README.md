# Chat service — Cloudflare Worker, Durable Objects, D1

Owns every chat read and write for every ScholasticCloud deployment.

One Worker serves **all** of them — production and each self-hosting client. That is the reason it exists. The API is deployed by unzipping onto shared hosting, where no long-running process can be kept alive and where a poll from every open tab was the load that made chat unviable. Moving chat to the edge leaves the API holding one thing: identity.

## What lives where

```
   browser                     the API (per tenant)              this service
      │                              │                                │
      │  1. GET /api/chat/token      │                                │
      ├─────────────────────────────>│  signs an HS256 token          │
      │                              │                                │
      │  2. everything else ─────────────────────────────────────────>│
      │     conversations, messages, sync, unread, socket             │  D1
      │                              │                                │
      │                              │  3. POST /internal/rosters ───>│
      │                              │     whenever enrolment changes │
      │                              │                                │
      │  4. ◀── WebSocket frame ──────────────────────────────────────┤
      │  5. ◀── Web Push (tab closed) ────────────────────────────────┤
```

**Laravel is the authority on membership; this service holds a copy.** Enrolment never leaves MySQL — it is derived from advisory sections and subject assignments, which this service knows nothing about. So Laravel computes the roster and pushes it, and the copy here is what authorizes every read and write. Three things keep the copy honest:

1. **Push on change.** An enrolment write triggers a roster push in the same request cycle.
2. **Apply only if newer.** Every push carries a `roster_version` that Laravel increments. A delayed retry arriving after a newer push is dropped, not applied.
3. **A full snapshot, half-hourly.** The cron trigger asks each tenant for everything. This exists because the failure mode is silent: a student left out of their class group has no way to know they are missing one.

## Opt-in per tenant

A deployment with `CHAT_*` unset serves chat from its own MySQL exactly as before — same endpoints, same shapes, slower. The frontend resolves which backend it has once per session and routes accordingly.

That is deliberate and worth keeping: a self-hosting client whose contract says their students' data stays on their server can leave this off and lose nothing but latency.

## One Durable Object per person, not per conversation

A WebSocket connects to exactly one Durable Object. A student sits in an advisory plus eight or so subjects, so per-conversation objects would mean nine sockets open on a school tablet.

Per-person means one socket per client and moves the fan-out to the publisher, which is cheap. Objects use the **WebSocket Hibernation API** (`state.acceptWebSocket`), so an object is evicted from memory while its socket stays open — a school is idle about eighteen hours a day.

The socket is **receive-only**. Nothing a client sends is treated as a message: posting goes through the API, where membership, rate limits and the database are.

## Notifications

The fan-out knows which recipients had no socket open, and that is the only place it is knowable. Those people get a Web Push instead.

It is written out longhand in `src/push.js` — VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291) — because the npm libraries assume Node's `crypto.createECDH` and `Buffer`, neither of which exists in a Worker. The payload is encrypted to keys only the subscriber's browser holds, so the push service in the middle relays text it cannot read.

```bash
node scripts/vapid-keys.mjs      # once, ever
npx wrangler secret put CHAT_VAPID
```

Leave `CHAT_VAPID` unset and push is simply off: the app never offers the toggle. **Keep the pair once set** — every subscription a browser holds is bound to the public key it was created with, so replacing it means silence until every device subscribes again.

Subscriptions are pruned automatically: 404 and 410 from a push service mean the browser threw it away, and the row follows.

## Routes

| Route | Caller | Auth |
|---|---|---|
| `GET /v1/conversations` | browser | chat token |
| `GET /v1/conversations/:id/messages?before=` | browser | chat token |
| `POST /v1/conversations/:id/messages` | browser | chat token |
| `POST /v1/conversations/:id/messages/:mid/delete` | browser | chat token, teacher or own |
| `POST /v1/conversations/:id/lock` | browser | chat token, teacher of that group |
| `POST /v1/conversations/:id/read` | browser | chat token |
| `GET /v1/sync?since=` | browser | chat token |
| `GET /v1/unread-count` | browser | chat token |
| `GET /v1/push/key` | browser | chat token |
| `POST /v1/push/subscribe` · `/unsubscribe` | browser | chat token |
| `GET /connect?token=` | browser | chat token, in the query string |
| `POST /internal/rosters` | the API, on enrolment change | tenant secret + `X-Chat-Tenant` |
| `POST /internal/publish` | the API, when it still serves chat itself | tenant secret + `X-Chat-Tenant` |
| `GET /` | health | none |
| cron `*/30 * * * *` | → `POST <api>/chat/roster-snapshot` per tenant | tenant secret |

**The token proves identity and nothing else.** What a person may see is decided by the roster, re-read on every single request — so a student removed from a section loses access at once rather than when their token lapses.

## Configuration

One secret holds every tenant, so a new school is a secret update rather than a deploy:

```jsonc
// CHAT_TENANTS
{
  "prod":      { "secret": "…", "api": "https://api-v2.scholastic.cloud/api",       "db": "CHAT_DB_PROD" },
  "maranatha": { "secret": "…", "api": "https://api.maranathagensan.edu.ph/api",    "db": "CHAT_DB_MARANATHA" },
  "mcadavao":  { "secret": "…", "api": "https://api.mcadavao.com/api",              "db": "CHAT_DB_MCADAVAO" }
}
```

**Per-tenant secrets, not one shared key.** A single key would let any compromised deployment mint tokens naming a different school. The token's `tenant` claim selects which secret to verify against — read unverified, exactly as a `kid` header is, and trusted for nothing else.

**One D1 database per tenant.** D1 executes one query at a time, so a shared database would serialize every school behind every other one. Adding a client is a database, a `[[d1_databases]]` block, and a `db` in the secret:

```bash
npx wrangler d1 create scholastic-chat-<tenant>
npx wrangler d1 execute scholastic-chat-<tenant> --remote --file schema.sql
```

`schema.sql` is entirely `IF NOT EXISTS`, so re-running it against an existing database is how a *new table or index* is applied. A new **column** is not — `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists — so those live in `migrations/`, numbered, and are run once per tenant:

```bash
npx wrangler d1 execute scholastic-chat-<tenant> --remote --file migrations/0001_message_changed_at.sql
```

On the API side, each deployment sets the matching trio in its `.env`:

```
CHAT_TENANT=maranatha
CHAT_WORKER_URL=https://scholastic-chat-realtime.<account>.workers.dev
CHAT_WORKER_SECRET=<the same secret as that tenant's entry>
```

## Local development

```bash
cd microservices/chat-realtime
npm install
cp .dev.vars.example .dev.vars                                   # then fill it in
npx wrangler d1 execute scholastic-chat-prod --local --file schema.sql
npm run dev                                                       # http://localhost:8787
```

`.dev.vars` is gitignored.

## First deployment

Order matters: `wrangler deploy` fails while any `database_id` is still the placeholder, so the databases come first.

```bash
# 1. One database per tenant, and paste each returned id into wrangler.toml
npx wrangler d1 create scholastic-chat-prod
npx wrangler d1 create scholastic-chat-maranatha
npx wrangler d1 create scholastic-chat-mcadavao

# 2. Schema into each
for t in prod maranatha mcadavao; do
  npx wrangler d1 execute scholastic-chat-$t --remote --file schema.sql
done

# 3. Secrets
npx wrangler secret put CHAT_TENANTS    # the JSON above
npx wrangler secret put CHAT_VAPID      # node scripts/vapid-keys.mjs

# 4. Deploy
npm run deploy

# 5. Prime each tenant, rather than waiting up to 30 minutes for the cron
curl -X POST https://<tenant-api>/chat/roster-snapshot \
     -H "Authorization: Bearer <that tenant's secret>"
```

Then set `CHAT_TENANT`, `CHAT_WORKER_URL` and `CHAT_WORKER_SECRET` in each deployment's `api/.env`. Until those are set, that school keeps serving chat from its own MySQL and nothing about this Worker affects it — which is the safe order to roll out in: deploy, prime, verify, *then* switch one school over.

**Check the plan before the first real class uses it.** Subrequests are capped at 50 per request on the free plan and a message costs up to two per recipient, so a section of thirty is already close. This needs Workers Paid.

**Watch the first cron run.** The scheduled snapshot calls back into each tenant's API, and all three are behind Hostinger's bot-protection challenge, which answers a plain `fetch` with a 403 HTML page rather than an error. That would leave the anti-entropy pass silently doing nothing. `npx wrangler tail` shows the status per tenant — it must be 200.

## Deploy

```bash
npm run deploy
npx wrangler tail    # live logs
```

## Things worth knowing before changing this

- **Subrequest ceiling.** Every Durable Object call and every push is a subrequest: **50 per request on free, 10,000 on paid**. A message costs up to two per recipient — one Durable Object call, and one push if that recipient had no socket. A normal section clears 50 on its own, so this needs the paid plan.
- **Fan-out width is six, not a tuning knob.** A Worker invocation may hold only six connections at a time waiting for response headers. `FANOUT_BATCH` matches that; raising it does not make delivery faster, it just queues.
- **Unread is arithmetic, not a count.** `conversations.message_seq - participants.read_seq`. Counting rows across every group a person is in would queue behind itself on a single-threaded database.
- **A roster push must never touch read positions, or the lock.** Someone who leaves a section and returns keeps their place; rebuilding the roster must not hand them 400 unread messages. And a roster says who is *enrolled* — whether a teacher has closed the group is decided here, so a push arriving a second later must not reopen it.
- **The sync poll is keyed on `changed_at`, not `created_at`.** A message removed an hour after it was sent has to reach the people still looking at it, and a poll asking only for newer posts would never mention that row again.
- **Nothing here calls back to Laravel on a request path.** Tokens verify locally against the tenant secret. That is what keeps the API off the hot path, and what lets this work for a deployment behind a firewall the Worker cannot reach.
