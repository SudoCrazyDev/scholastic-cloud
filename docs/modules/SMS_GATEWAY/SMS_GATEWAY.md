# Module: SMS Gateway

> Context doc for working on or integrating with the **SMS Gateway** module.
> Use the [file map](#file-map) to jump straight to whatever a new feature touches.
> If another module needs to **send an SMS**, read
> [Integrating from other modules](#integrating-from-other-modules) — you call one
> method (`SmsService::queue`), you do not talk to a modem.

Location in nav: **SMS Gateway** group (`/sms/gateways`, `/sms/messages`, `/sms/settings`).
Visible to roles: `super-administrator`, `principal`, `institution-administrator`.
Everything is **institution-scoped** (resolved from the authenticated user's default institution).

---

## Core concept

Instead of a paid cloud SMS API, the school sends SMS over **local prepaid SIMs** using a
**USB GSM modem** plugged into an on-prem **kiosk** — a Raspberry Pi (Linux) or a Windows PC.
Each kiosk runs a **headless agent** (no local UI); everything is managed from the portal.

Two halves:

1. **Portal (`api/` + `app/`)** — registers kiosks, queues/reviews messages, holds settings.
   It never touches hardware; it only reads/writes rows in the DB and serves an installer.
2. **Kiosk agent (`sms_gateway/`)** — a Node/TypeScript daemon that talks to the modem via
   **AT commands + PDU mode**, and **pulls** work from the portal over HTTP. It is the only
   thing that touches the modem.

The architecture is a deliberate clone of the **HRIS/ZKTeco bridge**: on-prem agent per device,
**pairing code → hashed long-lived token** auth, heartbeat, and a **pull-based queue** (the agent
polls; the server never pushes). If you have worked on the bridge, this will feel identical.

**Message lifecycle (outbound):**
`queued` → agent claims it → `sending` → agent reports result → `sent` / `failed`
→ (network delivery report) → `delivered`. A queued message can be `canceled` before it is claimed.

**Message lifecycle (inbound):** the agent reads received SMS off the modem and posts them; they
land as `received` rows (`direction=inbound`). A reply whose body matches an **opt-out keyword**
adds the sender to the institution's opt-out list.

---

## File map

Everything the module touches, so a new feature knows exactly what to open. Paths are
repo-relative; line numbers drift — search the symbol if it has moved.

**Backend — portal (`api/`)**
- Migrations (`database/migrations/`):
  - `2026_07_20_000001_create_sms_gateways_table.php` — `sms_gateways` (the kiosks).
  - `2026_07_20_000002_create_sms_messages_table.php` — `sms_messages` (out + inbound).
  - `2026_07_20_000003_create_sms_settings_table.php` — `sms_settings` (one row per institution).
  - `2026_07_20_000004_create_sms_opt_outs_table.php` — `sms_opt_outs`.
- Models (`app/Models/`): `SmsGateway.php`, `SmsMessage.php`, `SmsSetting.php`, `SmsOptOut.php` (all `HasUuids`).
- Controllers (`app/Http/Controllers/`):
  - `SmsBridgeController.php` — **agent-facing**: `pair`, `heartbeat`, `outbox`, `outboxStatus`, `deliveryReports`, `inbox`.
  - `SmsGatewayController.php` — **admin** CRUD + `refreshPairingCode` + `installer` (streams the .zip).
  - `SmsMessageController.php` — **admin**: list/compose/show/retry/cancel.
  - `SmsSettingsController.php` — **admin**: show/update per-institution settings.
- Service: `app/Services/SmsService.php` — **`queue()` is the send seam** other modules call.
- Middleware: `app/Http/Middleware/AuthenticateSmsToken.php` — alias `auth.sms.token`, registered in `bootstrap/app.php`.
- Support: `app/Support/ZipBuilder.php` — dependency-free STORE-method ZIP writer (no `ext-zip` on shared hosting).
- Console: `app/Console/Commands/BundleSmsAgent.php` — `php artisan sms:bundle-agent`.
- Vendored agent snapshot: `api/resources/sms-agent/**` — a committed copy of `sms_gateway/` the installer
  ships when production has no sibling `sms_gateway/` folder. **Regenerate with the bundle command after
  any agent change** (see [Keeping the vendored agent in sync](#keeping-the-vendored-agent-in-sync)).
- Routes: `routes/api.php` — public `POST /sms-gateway/pair` (L86); `auth.sms.token` group L89–94;
  admin block inside `auth.token` L491–509.

**Frontend (`app/`)**
- Pages (`src/pages/SMS/`): `Gateways.tsx`, `Messages.tsx`, `Settings.tsx`.
- Service: `src/services/smsService.ts` (axios via `../lib/api`; `getInstaller(id)` uses `responseType: 'blob'`).
- Types: `src/types/index.ts` — `SmsGateway`, `SmsMessage`, `SmsMessageStatus`, `SmsSettings`.
- Route registration: `src/App.tsx` (`sms/gateways|messages|settings`); nav group in `src/components/sidebar/Sidebar.tsx`.

**Kiosk agent (`sms_gateway/`)** — see [Kiosk agent](#kiosk-agent) for details.
- `src/`: `index.ts` (entry + pair mode), `config.ts` (env), `portal.ts` (HTTP client), `agent.ts`
  (the loops), `modem.ts` (AT layer + auto-detect), `pdu.ts` (PDU codec), `logger.ts`.
- `scripts/ctl.mjs` — cross-platform service control (`npm run enable-start|logs|restart|stop|status`).
- `deploy/`: `install.sh` (Linux/Pi), `install.ps1` (Windows), `sms-gateway.service` (systemd), `99-gsm-modem.rules` (udev).

---

## Data model

### `sms_gateways` — the kiosk devices
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid | FK → institutions, cascade; indexed |
| name | string | |
| location | string nullable | |
| platform | enum | `linux` \| `windows` \| `unknown` (default `unknown`) |
| status | enum | `online` \| `offline` \| `unknown` (persisted from heartbeat) |
| sms_token_hash | string nullable **unique** | sha256 of the long-lived token; plaintext returned once at pairing |
| pairing_code | string(8) nullable | short code, cleared on successful pair |
| pairing_code_expires_at | timestamp nullable | 15-min TTL |
| last_seen_at | timestamp nullable | updated on every heartbeat |
| signal_strength | int nullable | CSQ 0–31 |
| network_operator | string nullable | from `AT+COPS?` |
| sim_msisdn | string nullable | the SIM's own number, if known |
| sim_balance | string nullable | free-form, from USSD |
| imei | string nullable | |
| modem_model | string nullable | |
| agent_version | string nullable | |
| timestamps | | |

`is_online` (model accessor) = a heartbeat within the last **150s** (2.5× the ~60s interval).
`computed_status` returns `unknown` until the first heartbeat, else `online`/`offline`.
`sms_token_hash` and `pairing_code` are in the model's `$hidden`.

### `sms_messages` — outbound + inbound
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid | FK → institutions, cascade |
| gateway_id | uuid nullable | FK → sms_gateways, **nullOnDelete**; null until an outbound row is claimed |
| direction | enum | `outbound` \| `inbound` |
| to_number | string nullable | outbound recipient |
| from_number | string nullable | inbound sender |
| body | text | |
| status | enum | `queued` \| `sending` \| `sent` \| `delivered` \| `failed` \| `received` \| `canceled` |
| segments | unsigned smallint | default 1; estimated GSM segments |
| error | text nullable | |
| provider_ref | string nullable | modem message reference; keys delivery-report matching; indexed |
| source | string nullable | `manual` \| `announcement` \| `finance` \| `attendance` |
| source_type | string nullable | originating model class (optional) |
| source_id | string nullable | originating record id (optional) |
| queued_by | uuid nullable | FK → users, nullOnDelete |
| scheduled_at | timestamp nullable | not claimed until due |
| sent_at / delivered_at / received_at | timestamp nullable | |
| timestamps | | |

Indexes: `(gateway_id, status)`, `(institution_id, direction, created_at)`, `provider_ref`.

### `sms_settings` — one row per institution
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid **unique** | FK → institutions, cascade |
| default_gateway_id | uuid nullable | FK → sms_gateways, nullOnDelete; gateway a message defaults to |
| rate_limit_per_minute | unsigned smallint | default 20; enforced in `outbox` claim |
| send_window_start / send_window_end | time nullable | *(stored + editable; **not yet enforced** in claim — see [Not yet wired](#not-yet-wired))* |
| opt_out_keywords | string | default `STOP`; comma-separated, matched on inbound |
| sender_name | string nullable | |
| timestamps | | |

### `sms_opt_outs` — do-not-text list
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid | FK → institutions, cascade |
| number | string | |
| timestamps | | |

`unique(institution_id, number)`. `SmsService::queue` skips any number on this list.

---

## Auth model (how a kiosk authenticates)

1. Admin creates a gateway in the portal → server mints an 8-char **pairing code** (15-min TTL).
2. Kiosk runs `--pair <CODE>` → `POST /sms-gateway/pair`. Server mints a 64-char token, stores
   **only its sha256** in `sms_token_hash`, clears the code, returns the **plaintext once**.
3. Agent writes the token to its `.env`; every subsequent call sends `Authorization: Bearer <token>`.
   `AuthenticateSmsToken` sha256s it and looks up the gateway.

Consequences worth knowing (these have bitten us):
- **`pair` guards `whereNull('sms_token_hash')`** — a gateway that already has a token cannot re-pair
  with a code. If the agent fails to persist the returned token, the gateway is stranded (server thinks
  it's paired, device has no token). Recovery = **delete the gateway and recreate**, then re-pair. The
  agent now prints the token on a write failure so it can be pasted in by hand.
- The **token is bound to the gateway row**. Deleting/recreating the gateway orphans the device's token →
  `401 Invalid gateway token`. Always delete *and* re-pair as a pair.
- The **installer download never contains the token** — only the API URL + a fresh short-lived pairing code.

---

## API

All admin responses use `{ success, message?, data }` and are institution-scoped (students 403).
Agent endpoints return `{ success, data? }` and authenticate with the gateway token, not a user.

### Agent-facing (`auth.sms.token`, except `pair`)
| method | path | body | notes |
|---|---|---|---|
| POST | `/api/sms-gateway/pair` | `{ pairing_code, imei?, modem_model?, platform?, agent_version? }` | **public**; returns `{ token, gateway_id }` once |
| POST | `/api/sms-gateway/heartbeat` | `{ online?, signal_strength?, network_operator?, sim_msisdn?, sim_balance?, imei?, modem_model?, platform?, agent_version? }` | updates presence + telemetry |
| GET | `/api/sms-gateway/outbox?limit=` | — | atomically claims ≤`limit` queued rows → `sending`; honors rate limit; returns `[{id,to_number,body}]` |
| POST | `/api/sms-gateway/outbox/status` | `{ results:[{id,status:sent\|failed,provider_ref?,segments?,error?,sent_at?}] }` | idempotent; terminal rows untouched |
| POST | `/api/sms-gateway/delivery-reports` | `{ reports:[{provider_ref,status:delivered\|failed,delivered_at?}] }` | matches outbound by `provider_ref` |
| POST | `/api/sms-gateway/inbox` | `{ messages:[{from,body,received_at?}] }` | deduped; opt-out keywords recorded |

**Claim logic** (`outbox`): inside a `DB::transaction` + `lockForUpdate`, selects `queued` outbound rows
for the institution where `gateway_id IS NULL OR = me` and `scheduled_at IS NULL OR <= now`, oldest first,
capped by `min(limit, rate_limit_per_minute − sent_in_trailing_minute)`, and flips each to `sending`.

### Admin-facing (`auth.token`)
| method | path | body / query | notes |
|---|---|---|---|
| GET | `/api/sms/gateways` | — | list with `computed_status`, `is_paired` |
| POST | `/api/sms/gateways` | `{ name, location? }` | returns one-time `pairing_code` |
| GET | `/api/sms/gateways/{id}` | — | |
| PATCH | `/api/sms/gateways/{id}` | `{ name?, location? }` | |
| DELETE | `/api/sms/gateways/{id}` | — | unguarded (also the re-provision escape hatch) |
| POST | `/api/sms/gateways/{id}/refresh-pairing-code` | — | **422 if already paired** |
| GET | `/api/sms/gateways/{id}/installer` | — | streams `sms-gateway-<slug>.zip` (agent + prefilled env) |
| GET | `/api/sms/messages` | `?direction=&status=&gateway_id=&search=&date` | |
| POST | `/api/sms/messages` | `{ numbers:string[], body, gateway_id?, scheduled_at? }` | compose + queue (one row per number); `body` ≤1600 |
| GET | `/api/sms/messages/{id}` | — | |
| POST | `/api/sms/messages/{id}/retry` | — | re-queue a failed row |
| POST | `/api/sms/messages/{id}/cancel` | — | cancel a not-yet-claimed row |
| GET | `/api/sms/settings` | — | |
| PUT | `/api/sms/settings` | `{ default_gateway_id?, rate_limit_per_minute?(1–600), send_window_start?(H:i), send_window_end?(H:i), opt_out_keywords?, sender_name? }` | upsert per institution |

---

## Frontend

- **Gateways** (`pages/SMS/Gateways.tsx`) — table of kiosks (status/signal/operator/SIM/balance/last-seen/
  platform). *Add gateway* shows the `PairingCodeDisplay`; per-row **Download installer** (blob → `.zip`),
  **Refresh code** (only when not paired), delete. Polls with `refetchInterval`.
- **Messages** (`pages/SMS/Messages.tsx`) — Outbound/Inbound tabs, filters, **Compose** modal
  (recipients as manual/comma-separated numbers in V1, GSM-7 segment counter, gateway picker, optional schedule).
- **Settings** (`pages/SMS/Settings.tsx`) — default gateway, rate limit, send window, opt-out keywords, sender name.
- Service `services/smsService.ts`; types in `types/index.ts`.
- Always use the shared `Select` from `components/select` (never raw `<select>`).

---

## Kiosk agent

Node + TypeScript ESM daemon in `sms_gateway/`. Runs as a **service** (systemd on Linux, Scheduled Task
on Windows) under the `smsgw` service user, which must be in the `dialout` group for modem access.

- **`index.ts`** — entry. `--list-ports`, `--pair <CODE>` (pairing mode), else the normal run. When
  **not paired it waits** (15s poll, reloads `.env`) instead of exiting, so systemd doesn't crash-loop.
- **`config.ts`** — reads `.env` **or** the portal-downloaded `sms-gateway.env` (prefers `.env` if both
  exist). `reloadConfig()` re-reads with dotenv `override`. `persistToken()` writes the token back.
- **`modem.ts`** — AT layer. **Auto-detects** the modem by ranking USB vendor IDs and probing with
  `AT`/`AT+CGMM`. Tolerant `>` prompt detection for `AT+CMGS` (some modems omit the trailing space);
  ESC-abort recovery on send timeout.
- **`pdu.ts`** — PDU codec (GSM-7 + UCS2, concatenation UDH, DELIVER/STATUS-REPORT). Self-test via `pdu.selftest.ts`.
- **`agent.ts`** — the three loops: **heartbeat** (`AT+CSQ`/`AT+COPS?`/balance → `/heartbeat`),
  **outbound** (`/outbox` → `AT+CMGS` per message → `/outbox/status`), **inbound** (`+CMTI` read →
  `/inbox`; `+CDS` → `/delivery-reports`).
- **`portal.ts`** — HTTP client (`withRetry` backoff on the loops).

**Service commands** (`scripts/ctl.mjs`): `npm run pair -- <CODE>` · `npm run enable-start` ·
`npm run logs` · `npm run restart` · `npm run stop` · `npm run status` · `npm run list-ports`.

**Install (Linux/Pi):** `sudo ./deploy/install.sh` → copies to `/opt/sms_gateway`, creates the `smsgw`
user, builds, installs the systemd unit. **Pair as the service user** so it can write the env:
`sudo -u smsgw node dist/index.js --pair <CODE>`.

The systemd unit sets `StartLimitIntervalSec=0` so a genuine crash can never permanently ban it.

### Keeping the vendored agent in sync

Production deploys `api/` only — there is no sibling `sms_gateway/` there — so the installer serves a
**committed snapshot** at `api/resources/sms-agent/`. After **any** change under `sms_gateway/`, run:

```bash
cd api && php artisan sms:bundle-agent
```

and commit the regenerated `api/resources/sms-agent/**` alongside your `sms_gateway/**` change, or the
downloaded installer ships stale agent code. (`installer` falls back to `../sms_gateway` when present, so
in the monorepo it can serve live files, but never rely on that for prod.)

---

## Integrating from other modules

**Goal: "send an SMS to these people from my feature."** You call one method. You never touch the modem,
the queue mechanics, opt-outs, or segmentation — `SmsService` handles all of it.

```php
use App\Services\SmsService;

app(SmsService::class)->queue(
    $institutionId,                    // scope
    ['09171234567', '+639181234567'],  // string or string[]; light-normalized, de-duped
    'Your child was marked absent today.',
    [
        'source'      => 'attendance',        // manual|announcement|finance|attendance
        'source_type' => Attendance::class,   // optional provenance
        'source_id'   => $attendance->id,      // optional
        'gateway_id'  => null,                  // null → settings.default_gateway_id, else any gateway claims it
        'scheduled_at'=> null,                  // future ISO datetime to defer
        'queued_by'   => $user->id,             // optional
    ],
);
// returns string[] of created message IDs (empty if all numbers were opted out / blank)
```

What `queue()` does for you: normalizes + de-dupes numbers, skips `sms_opt_outs`, estimates `segments`,
resolves the gateway (explicit → institution default → any), and writes `queued` rows. The kiosk agent
then pulls and sends them. **There is no synchronous send** — delivery is eventual and best-effort.

### Conventions to respect
- **Institution-scope everything.** `queue()` requires an `institution_id`; resolve it the same way the
  controllers do (authed user's default institution).
- **Resolve recipients to phone numbers yourself.** This module does not know about students/staff.
  Confirm a contact-number field exists on your source records before wiring a producer.
- Numbers are only lightly normalized (strip spaces/dashes/parens, keep a leading `+`). Locale formatting
  (e.g. `09xx` vs `+639xx`) is the caller's responsibility.
- Set a meaningful **`source`** so the Messages screen can filter by origin.

---

## Not yet wired

- **No producers call `SmsService::queue()` yet.** Announcements / Finance / Attendance integration is the
  planned Phase 3 — the seam exists and is tested, but nothing feeds it except the manual **Compose** screen.
- **`send_window_start/end` is stored and editable but not enforced** in the `outbox` claim. Only
  `rate_limit_per_minute` and `scheduled_at` gate sending today.
- **Recipients are raw numbers.** No student/staff picker or contact-book resolution in the Compose UI.
- **No `sms_templates`.** Bodies are free text.
- **No auto re-pair from the UI** — a stranded/orphaned-token gateway is recovered by delete + recreate,
  not a button.
- Inbound is stored and opt-out-aware but has **no conversation/threading UI** — it's a flat Inbound list.
