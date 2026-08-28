# Module: Gate Kiosk — Offline Mode (V1)

> **Status: built, all five phases.** This is the design doc for making the gate
> kiosks work on a slow or dead internet link. A paired kiosk holds its campus in IndexedDB, draws a
> tap from cache, and **records the scan locally before anything touches the network** — so a tap no
> longer waits on the link to be recorded, only to be acknowledged.
>
> What that costs: from here a green card is drawn by the device, not earned from the server, so the
> honesty of the gate now rests on the outbox rather than on a round trip. Three things carry it —
> the row is written to disk before the card is drawn, it is deleted **only** when the server names
> that exact `client_scan_id`, and retrying is free because ingest is idempotent. A queued scan says
> "saved, waiting to upload" on the card rather than pretending to be recorded.
>
> Kiosks that have not been paired keep working unchanged on `/gate-enter?institution_id=…`. See
> [Rollout](#rollout) for what each phase actually shipped, and
> [Non-goals and known gaps](#non-goals-and-known-gaps) for what this deliberately does not do —
> chiefly that **boot still needs the network**.

Affects: the gate kiosk pages (`/gate-enter`, `/gate-exit`), the **Gate Entries** admin page (which
gains a Kiosk devices card), and the ingest side of `rfid_scan_logs`. Everything stays
**institution-scoped**, and permissions ride on the existing `gate-entries` module.

---

## The problem

Schools on slow links have a gate that backs up. Every tap costs three round trips:

1. **Boot** — Chromium loads the SPA from the remote host. `kiosk.sh` even waits for the URL to
   answer first (`KIOSK_WAIT_FOR_URL`), by design, so a dead link means a dead kiosk.
2. **The tap** — `POST /api/kiosk/scan` both *resolves* the UID → student and *writes* the log in
   one call. The display cannot advance until it returns.
3. **The photo** — `student.profile_picture` is an R2/media URL fetched only *after* the response
   lands, so on a slow link the picture appears after the student has already walked past.

Caching a roster on the device fixes (3) and the read half of (2). It does **not** fix the write:
if the POST takes four seconds, the queue still forms. So the kiosk has to become **local-first in
both directions** — resolve locally, render immediately, and hand the scan to an outbox that
uploads whenever the link allows.

### What exists today

- `kiosk/` — `install-kiosk.sh`, `kiosk.sh`, `kiosk.default`. Chromium in `--kiosk` on a Pi,
  respawned if it dies. Config lives in `/etc/default/kiosk`.
- `app/src/pages/Gate/` — `GateEnter.tsx` / `GateExit.tsx` read `institution_id` and `device_name`
  from the **query string**; `GateKiosk.tsx` holds a hidden input the RFID reader types into,
  posts each scan, and renders the result card for 5s.
- `api/.../RfidScanLogController::kioskScan` — **public, unauthenticated**, throttled `pairing`.
  Resolves an active `student_rfid_tags.rfid_uid`, or falls back to a raw student UUID from a QR
  code when that student is an active member of the scanning institution.
- `app/public/sw.js` — a service worker for **chat push only**. It deliberately has **no `fetch`
  handler**, and the file says why. Do not add one there; see [Non-goals](#non-goals-and-known-gaps).

### File map

Everything below is in the repo.

**Backend (`api/`)**
- `database/migrations/2026_08_24_000001_create_gate_devices_table.php`
- `database/migrations/2026_08_28_000001_add_client_scan_id_to_rfid_scan_logs.php` — the
  idempotency key, plus `clock_suspect`
- `database/migrations/2026_08_28_000002_add_late_threshold_to_gate_sms_settings.php`
- `database/migrations/2026_08_29_000001_create_gate_unresolved_scans_table.php`
- `app/Models/GateDevice.php` — presence thresholds, `is_paired`, `clock_suspect`
- `app/Models/GateUnresolvedScan.php` — the worklist, with `note()` for the upsert
- `app/Models/RfidScanLog.php` — `client_scan_id`, `clock_suspect`
- `app/Models/GateSmsSetting.php` — `late_threshold_minutes`
- `app/Http/Middleware/AuthenticateGateToken.php` — alias `auth.gate.token`, registered in `bootstrap/app.php`
- `app/Http/Controllers/GateKioskController.php` — device-facing `pair`, `heartbeat`, `roster`,
  `photo`, `scans`
- `app/Http/Controllers/GateDeviceController.php` — admin CRUD, `refreshPairingCode`, `unpair`
- `app/Http/Controllers/GateUnresolvedScanController.php` — the worklist's `index` / `destroy`
- `app/Http/Controllers/GateSmsSettingController.php` — accepts `late_threshold_minutes`
- `app/Services/GateSmsNotifier.php` — `tooLate()`, checked before the cooldown
- `app/Services/GateRosterSnapshot.php` — the roster predicate, `changed_at`, keyset paging, removals
- `app/Services/GatePhotoThumbnail.php` — hashing, GD resize with pass-through fallback, r2 cache
- `app/Support/ZipStreamWriter.php` — streaming ZIP, sibling to the in-memory `ZipBuilder`
- `app/Console/Commands/BuildGateSeedSnapshot.php` — `php artisan gate:seed-snapshot`
- `routes/api.php` — public `POST /gate/pair`; the `auth.gate.token` group (`heartbeat`, `roster`,
  `photo`, `scans`); admin `gate/devices` and `gate/unresolved-scans` blocks beside the existing
  `rfid-scan-logs` routes
- `config/cors.php` — `exposed_headers: ['Date', 'ETag']`, without which the kiosk cannot read
  either (see [the phase-3 review](#what-the-phase-3-review-found))
- `tests/Feature/GateDevicePairingTest.php`, `tests/Feature/GateRosterSnapshotTest.php`,
  `tests/Feature/GatePhotoTest.php`, `tests/Feature/GateScanIngestTest.php`,
  `tests/Feature/GateUnresolvedScanTest.php`

**Running the photo tests:** GD is off in the default XAMPP build, so the resize cases skip. To run
them without editing `php.ini`, call PHPUnit directly — `artisan test` spawns a subprocess that does
not inherit `-d`, so the flag is silently lost there:

```bash
DB_CONNECTION=mysql DB_DATABASE=scholastic_cloud_test \
  php -d extension=gd vendor/bin/phpunit --filter=GatePhotoTest
```

**Frontend (`app/`)**
- `src/services/gateDeviceService.ts`, `src/services/gateUnresolvedScanService.ts`
- `src/services/rfidScanLogService.ts` — `kioskScan` bounded at 15s (legacy path only)
- `src/types/index.ts` — `GateDevice`, `GateUnresolvedScan`, `RfidScanLog.clock_suspect` /
  `client_scan_id`, `GateSmsSetting.late_threshold_minutes`
- `src/pages/GateEntries/GateEntries.tsx` — mounts the cards per tab and shows `time unverified`
  beside a doubtful timestamp
- `src/pages/GateEntries/components/` — `GateDevicesCard.tsx`, `GateUnresolvedCard.tsx` (renders
  nothing when empty), `GateSmsCard.tsx` (the late cut-off field)
- `src/pages/Gate/offline/` — `db.ts`, `client.ts`, `sync.ts`, `resolve.ts`, `seed.ts`, `clock.ts`,
  `outbox.ts`, `useGateSync.ts`
- `src/pages/Gate/` — `GateTerminal.tsx` (the three-state router), `GatePairing.tsx` (two steps:
  code, then the optional seed bundle), `GateStatusChip.tsx`; `GateKiosk.tsx` resolving locally and
  writing through the outbox; `GateEnter/GateExit` reduced to thin wrappers; `GateConfigError.tsx`
  given optional `title`/`message`
- `src/lib/api.ts` — the 401 interceptor no longer navigates away from kiosk routes

---

## Core concept

The kiosk keeps a local copy of what it needs to answer a tap, and a local queue of what it owes
the server.

```
provisioning ──► USB seed (roster.json + thumbnails) ──► IndexedDB
                                                            │
boot ──► sync: roster delta ──► photos (background) ────────►│
                                                            │
tap ──► local index lookup ──► render from cached blob ──► outbox
                                                            │
                                     flusher ──► POST /api/gate/scans (batched, idempotent)
```

**One consistency rule governs the whole feature: the roster must contain exactly the set the
server would resolve.** `kioskScan` matches an *active* `student_rfid_tags` row, or an *active*
student with an *active* `student_institutions` row for that institution. The roster query mirrors
that predicate exactly — **not** `institutions.current_academic_year`, and nothing looser.
Diverge and you get students who resolve on the device and are rejected at ingest, which is the
one failure mode that loses attendance data silently.

### Decisions locked

| Decision | Choice | Why |
|---|---|---|
| Device auth | **Pair every kiosk** (pairing code → hashed token) | A public endpoint handing out a school's roster and photos to anyone holding the institution UUID is not defensible. Costs a one-time re-provision of fielded kiosks. |
| Offline depth | **Taps work offline; boot still needs the network** | The whole school day survives a dead link. A reboot during an outage does not — accepted, see [Non-goals](#non-goals-and-known-gaps). |
| Late parent SMS | **Suppress past a per-gate threshold** (default 15 min) | `{time}` renders from `scanned_at`, so a batch flushed at 10:00 texts an accurate-but-stale "arrived 7:12 AM". A three-hour-late arrival alert is worse than none and generates calls to the office. |
| Scale target | **3,000+ students per campus** | Drives the two-phase sync and the USB seed below; at this size a first-boot photo download is not viable. |

---

## Sizing, and why sync has two phases

For 3,000 students: the roster JSON is roughly **200 KB gzipped**. The photos are roughly
**90 MB**. On the links these schools have, those are not the same problem.

- **Phase A — roster JSON.** Names, section, and UIDs land first. The kiosk is **fully functional
  immediately** with a generic avatar. A device that never finishes downloading photos still
  records every scan correctly.
- **Phase B — photos.** Fetched behind the roster, 3 concurrent, resumable, with the page cursor
  persisted so a killed sync resumes instead of restarting.
- **USB seed.** `php artisan gate:seed-snapshot {device}` emits a zip (`roster.json` +
  thumbnails); the pairing screen offers an **Import seed** file picker. This is the difference
  between a two-hour campus install and a two-day one, and it is the primary provisioning path at
  this scale — network sync is then delta-only maintenance.
- **Storage permanence.** Call `navigator.storage.persist()` on first sync. Without it Chromium
  can evict 90 MB of cache under SD-card pressure and silently undo the feature.
  `QuotaExceededError` degrades to names-only rather than failing the kiosk.

---

## Data model

### New table: `gate_devices` — **built**

`2026_08_24_000001_create_gate_devices_table.php`, model `app/Models/GateDevice.php`.

| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid | FK → institutions, cascade; indexed |
| name | string | shown on the kiosk header, and used as `rfid_scan_logs.device_name` |
| location | string nullable | free-form, e.g. "beside the guard house" |
| gate_type | enum | `enter` \| `exit` \| `both` — `both` shows on both tabs of the admin card |
| device_token_hash | string nullable **unique** | sha256 of the long-lived token; plaintext returned once at pairing |
| pairing_code | string(8) nullable | cleared on successful pair |
| pairing_code_expires_at | timestamp nullable | 15-min TTL |
| last_seen_at | timestamp nullable | from heartbeat |
| last_sync_at | timestamp nullable | last successful roster pull |
| roster_count | int nullable | what the device believes it holds |
| pending_count | int nullable | outbox depth, from heartbeat |
| clock_offset_ms | int nullable | reported drift, so the portal can flag a bad clock |
| app_version | string nullable | |

Mirrors `sms_gateways` deliberately. If you have worked on the SMS gateway or the ZKTeco bridge,
this is the same shape.

### Changed: `rfid_scan_logs` — **built**

- **`client_scan_id`** — `string(64) nullable`, unique **per institution**. The idempotency key. A
  device that uploads a batch, loses the ack, and retries must not double-record. Nullable because
  online scans and admin-created rows have no client ID, and a composite unique index permits any
  number of nulls in MySQL. Scoped to the institution rather than global so a key cannot be squatted
  across tenants and so the check the endpoint runs is the same shape as the index enforcing it.
- **`clock_suspect`** — `boolean`, default false. Set when the device had never heard a real clock
  at the time of the tap, and also set here when a stamp arrives more than five minutes in the
  future — a device with a wrong-but-confident clock cannot flag itself.

### New table: `gate_unresolved_scans` — **built**

Taps that could not be turned into a scan. A card the server cannot resolve has nowhere to go —
`rfid_scan_logs` needs a student and there isn't one — so until phase 5 such a tap existed only as a
line in `laravel.log`, where the one group who could act on it never saw it.

Almost every one is a new enrolment whose tag was never entered, a replacement card, or a UID typed
in wrong. So this is a **worklist, not a log**: unique on `(institution_id, rfid_uid)` with
`attempts`, `first_seen_at`, `last_seen_at`, the device and gate of the latest attempt, and
`clock_suspect` carried through so the office is not shown a precise time the device could not vouch
for. Six identical rows would not be more informative than "this card tapped 6 times, most recently
at 07:41".

A row **clears itself** the moment that card resolves — registering the tag is exactly the fix the
list exists to prompt — so dismissing is only for the other endings: a visitor's card, a misread, a
tag nobody was ever going to register.

Written only from the **authenticated** `/gate/scans`. The legacy `/api/kiosk/scan` is public — its
institution comes from a query string — so recording from there would let anyone fill the table with
invented UIDs.

### Changed: `gate_sms_settings` — **built**

- **`late_threshold_minutes`** — `unsignedSmallInteger`, default `15`. `0` disables suppression
  (always send). Existing gates inherit 15, which is a real change in behaviour for them and the
  safe direction to be wrong in. Pulled forward from phase 5 deliberately: phase 4 is the first
  time an insert can be hours after the tap, so shipping the flusher without this would have texted
  every parent of a morning's backlog.

---

## Auth model — **built**

Identical to the SMS gateway: `POST /api/gate/pair` is public and throttled, takes a one-time
pairing code, and returns a long-lived token stored **hashed** server-side. Everything else sits
behind the `auth.gate.token` middleware (`AuthenticateGateToken`, aliased in `bootstrap/app.php`)
which resolves the `GateDevice` onto the request. **Institution, gate type, and device name come
from the token**, not from the query string — that is the change that retires `?institution_id=`.

The kiosk keeps the plaintext token in `localStorage`. Revoking the device in the portal nulls the
hash; the next call 401s and the kiosk purges its local roster and photos. Two ways to revoke:

- **Unpair** (`POST gate/devices/{id}/unpair`) keeps the row and hands back a fresh code, so the
  same physical kiosk is re-provisioned rather than re-registered. It also clears the reported
  `roster_count` / `pending_count` / `last_sync_at`, because those describe a local copy the device
  is about to throw away and would otherwise read as current.
- **Delete** removes the row, which cuts the token off the same way.

Pairing codes are 6 characters from `ACDEFGHJKMNPQRTUVWXY2346789` — the ambiguous glyphs (`0/O`,
`1/I/L`, `5/S`, `8/B`) are excluded because these codes get read aloud across a campus and typed
on a touchscreen. TTL is 15 minutes, and a code is single-use: a paired device cannot pair again,
and `refresh-pairing-code` 422s rather than minting a second credential for a live device.

**Permission:** the admin endpoints reuse **`gate-entries`** (`view` to list, `manage` to change)
rather than introducing a `gate-devices` slug. Managing the readers at a gate is the same job as
reading their scan logs, and a new slug would leave every existing custom role without it until an
administrator went and re-ticked it.

---

## API

All paths under `/api`. Device-facing (`GateKioskController`), `auth.gate.token` except `pair`:

| method | path | status | purpose |
|---|---|---|---|
| POST | `/gate/pair` | **built** | pairing code → `{ token, device, server_time }`. Public, throttled `pairing`. |
| POST | `/gate/heartbeat` | **built** | presence + reported `roster_count`, `pending_count`, `clock_offset_ms`, `last_sync_at`, `app_version`. Answers with `server_time`. |
| GET | `/gate/roster?since=&cursor=&limit=` | **built** | paginated delta. Per student: id, name parts, grade level, section title, active `rfid_uids[]`, `photo_hash`. Plus `removed_ids` (deactivated, unenrolled, tag revoked), `next_cursor`, `has_more`, `full`, and the `synced_at` to send back as the next `since`. |
| GET | `/gate/photo/{student}` | **built** | ~256px JPEG. `ETag` is the `photo_hash`; honours `If-None-Match`. See below. |
| POST | `/gate/scans` | **built** | batch ingest, idempotent on `client_scan_id`; per-item `accepted` / `duplicate` / `rejected`, plus `server_time`. Max 200 rows. Answers a **single-row** upload with the student's name as well — see below. |

Admin-facing, inside the `auth.token` group and gated on **`gate-entries`** — **built**:
`GateDeviceController` (`gate/devices` index/store/show/update/destroy, plus
`{id}/refresh-pairing-code` and `{id}/unpair`) and `GateUnresolvedScanController`
(`GET gate/unresolved-scans?gate_type=`, `DELETE gate/unresolved-scans/{id}`).

Two rules the endpoints hold to, both easy to undo by accident:

- **A pairing code appears only on the response that mints it** (`store`, `refresh-pairing-code`,
  `unpair`). It is in the model's `$hidden` and is never in a listing — an admin who can read a live
  code back out of a GET has a standing credential sitting in a response body. The UI keeps minted
  codes in component state for exactly this reason.
- **A heartbeat only overwrites what it sends.** A beat that omits `roster_count` must leave the
  stored value alone, or a kiosk reporting partial news would keep erasing its own sync progress.

`heartbeat` answering with `server_time` is not decoration: it is the clock reference the device
needs before it has any other reason to call the API. See
[Clock drift](#clock-drift-is-a-first-class-hazard).

### The write path — **built**

`POST /api/gate/scans` and `offline/outbox.ts` are two halves of one mechanism, and the rules that
hold it up are worth stating plainly because each is the answer to a specific way attendance gets
lost:

1. **Write first, upload second.** The row lands in IndexedDB before the card is drawn. A kiosk that
   loses power between the tap and the reply still has the scan.
2. **Delete only on an answer about that exact row.** Not "the batch went", not a count. The server
   names every `client_scan_id` it handled and only those are removed, so a partial or half-read
   reply costs nothing. A row the server says nothing about is simply sent again.
3. **Retrying is free.** The device generates the id and ingest is idempotent on it, so a device that
   cannot tell *recorded* from *reply lost on the way back* just sends again. This is also why
   concurrent uploads need no lock: the worst case is a row uploaded twice and recorded once.

**The device does not say who tapped.** It uploads the raw UID and the server resolves it. Two
reasons: the device's roster may be stale — a card issued after its last sync is unknown there and
perfectly known here, which is what makes queueing an unrecognised tap worthwhile rather than
theoretical — and a kiosk on a wall is not a trustworthy source for "this scan belongs to student X".

**A single-row upload comes back with the student.** A one-row batch is the tap someone is standing
in front of; anything larger is a backlog draining in the background. Only the former is answered
with names, so a card the device could not resolve locally still draws "Ana Recast · Grade 10 — Beta"
instead of "not recognised" — which the online-only page it replaces would have managed, and which
a backlog has no screen waiting for. Same fields the roster carries and no others: no mobile number,
no LRN.

**`unknown_tag` is terminal.** If the server cannot resolve a UID either, the device stops retrying
and drops the row, because a genuinely unregistered card would otherwise queue forever and no
pending count would ever clear. `GateKioskController::scans` logs it, and that log is the only trace
such a tap leaves anywhere. Known gap: worth surfacing in the portal rather than only in a log file.

**A `both` gate must say which direction, per scan,** and is refused if it does not. Guessing would
record an exit as an entrance and look like it worked.

### Why photos are served by the API, not from R2 — **built**

`GET /api/gate/photo/{student}` runs the original through `GatePhotoThumbnail` and caches the
result **once** on the r2 disk at `kiosk-thumbs/{sha1(source key)}.jpg`.

Serving from the API origin is a **correctness** requirement, not a preference:
`config/cors.php` allows all origins on `api/*`, while the R2 public domain (`R2_URL`) likely
sends no CORS headers. A no-CORS fetch yields an **opaque** response — the bytes cannot be read
into a Blob for IndexedDB at all, and opaque entries in Cache Storage carry heavy quota padding.
So the R2 URL that works fine in an `<img>` tag is unusable for an offline cache.

**`photo_hash` is `sha1` of the stored object key, and that is enough** because `StudentController`
writes every upload under a fresh UUID (`{institution}/student/{id}/profile/{uuid}.{ext}`) — a
re-photographed student always has a new key, so a new hash. Hashing the key alone means the roster
advertises it without a single storage round trip, and the endpoint's `ETag` is that same value:
the equality *is* the mechanism by which a kiosk knows what it already holds, so the two must never
drift. There is a test whose only job is to hold them together.

Three behaviours that are easy to lose:

- **GD is optional.** It is not in every PHP build — XAMPP ships `extension=gd` commented out, and
  there is no image library in `composer.json`. Without it the original bytes pass through
  unchanged and are deliberately **not** cached as a thumbnail, so enabling GD later produces real
  thumbnails instead of serving full-size copies forever. `X-Gate-Photo-Resized` says which
  happened, and `gate:seed-snapshot` warns loudly when it bundled originals — the difference
  between a 90 MB bundle and a 2 GB one.
- **EXIF orientation is applied before it is discarded.** Browsers rotate a photo to match that tag
  on their own, so phone portraits already look upright everywhere else in the app. GD does not, and
  re-encoding drops the tag — skip this step and the kiosk becomes the one screen in the system
  showing students sideways.
- **Decoding is budgeted.** GD holds the *uncompressed* bitmap (~w×h×4 bytes), so a 24-megapixel
  upload wants ~96 MB however small the JPEG was. Past the budget the resize is skipped rather than
  risking a fatal that takes the request with it.

Transparency is flattened onto white before encoding, because JPEG has no alpha and untouched
transparent pixels encode as black — which turns a cut-out portrait into a silhouette.

### The roster query — **built**

`GateRosterSnapshot` holds the delta logic; its docblock is the reference. What to know before
touching it:

- **`changed_at` spans five tables** — the student row, the enrolment, their tags, their section
  assignment, *and the section itself*. Issuing a card and renaming a section both change what the
  kiosk draws while leaving `students.updated_at` untouched, so a delta keyed on the student row
  alone serves stale data silently.
- **The comparison is floored to the second and inclusive.** `updated_at` is second-precision, so
  an exclusive comparison against a timestamp taken inside that same second loses the edit
  *permanently* — the row never looks newer again. The cost is that the boundary second gets
  re-sent, and the kiosk upserts, so a duplicate is free. This was a real bug the tests caught, not
  a hypothetical.
- **Pagination is keyset on `(changed_at, id)`**, not offset, so a roster changing under a paging
  device cannot shift rows across a page boundary.
- **A hard-deleted student cannot be reported** — nothing is left to carry a timestamp.
  `removed_ids` covers deactivation and unenrolment; the periodic full sync (omit `since`, which
  sets `full` in the response) reconciles deletions, and the kiosk prunes anything absent from it.

### The USB seed bundle — **built**

`php artisan gate:seed-snapshot <device-id> [--out=path]` writes `roster.json` plus
`photos/{hash}.jpg` for the whole campus. Running it also warms the server-side thumbnail cache, so
the first kiosk to sync a campus over the network pays for resizing once and every later device
reads the cached JPEGs.

It writes through `ZipStreamWriter`, a new sibling to `ZipBuilder`. The existing builder
accumulates the archive in a string — right for the few-KB SMS installer, but it would hold ~90 MB,
and roughly double that at the moment it concatenates, for a 3,000-photo bundle. The streaming
writer keeps one entry in memory at a time. Same deliberate no-`ext-zip` constraint, and STORE
costs nothing here because JPEGs are already compressed.

The kiosk reads it on **step two of the pairing screen** (`offline/seed.ts`): entries are
`File.slice()` views onto the file on disk, so a 90 MB bundle costs a few kilobytes of parsing, and
each slice is given an explicit MIME type rather than relying on Chromium sniffing an untyped blob
URL as an image. A bundle built for another school or another device is refused — a kiosk that
swallowed the wrong campus would resolve taps against strangers and look like it was working.

---

## The kiosk side — **built**

Three states, decided by `GateTerminal.tsx`: **paired** (token → local roster), **legacy**
(`?institution_id=`, unchanged online-only behaviour), and **unpaired** (the pairing screen, which
replaces the old "configuration required" error because that is now a step in an install rather
than a mistake). A device paired to the wrong direction is stopped rather than accepted —
recording entrances as exits would corrupt attendance while looking like a working gate. A device
whose token has been **revoked** does not fall back to legacy mode even if its URL still carries an
`institution_id`: revoking is how a school stops a kiosk it no longer trusts.

**Pairing is two steps**, and has to be. Step one takes the code; step two offers the USB seed
bundle and a **Start the gate** button, because the bundle is validated against the device it was
built for and so cannot be offered before a token exists. Step two starts the gate on its own after
a minute — a technician who pairs a terminal and walks away must not leave a wall-mounted screen
sitting on a setup prompt — and that countdown holds while a bundle is still importing.

**What a tap does now.** Resolve from IndexedDB → draw the card immediately, marked `saving…` →
`POST /api/kiosk/scan` as before → settle to recorded, or replace the card with the failure. A
local hit never turns a failed write into a success. Taps are also sequence-numbered, so a scan
still in flight when the next student taps cannot overwrite the newer card — the queue-forming
behaviour the local roster exists to remove.

Measured on a paired kiosk with the API stopped: **~5 ms** from tap to a fully drawn card with the
student's face, against ~2.2 s for the same tap in legacy mode against a *fast local* API. On the
links this feature is for, that second number is much worse.

Findings from building it, each of which would have shipped silently:

- **`Date` is not a CORS-safelisted response header.** `response.headers.get('Date')` is null
  cross-origin unless the server exposes it, so the clock correction — the entire defence against a
  Pi with no RTC stamping scans on the wrong day — quietly did nothing. `config/cors.php` now sets
  `exposed_headers: ['Date']`, and `pair`/`heartbeat` also return `server_time` in the body so a
  proxy that strips the exposure costs nothing.
- **A stale staff token turned the gate into a login screen.** `useAuthState` refreshes the profile
  on *every* page, kiosk pages included; the 401 interceptor in `lib/api.ts` then cleared storage
  and navigated to `/login`. On a wall-mounted terminal `kiosk.sh` cannot recover that — Chromium is
  alive, just showing the wrong page. The interceptor now refuses to navigate away from the kiosk
  routes.
- **`AnimatePresence mode="wait"` was the latency.** It holds the incoming card until the outgoing
  subtree finishes leaving, and the idle block contains two `repeat: Infinity` pulse rings on a
  three-second cycle — so the card waited on wherever that cycle happened to be, measured at
  1.5–2 s. This was always there; the network round trip used to hide it. Exits are now explicitly
  bounded. **Worth remembering when optimising anything else behind this component:** removing the
  network cost only revealed what was underneath it.

### What the phase-3 review found

Read back afterwards, four things in the code above were wrong in ways nothing on screen would have
shown. All four are fixed; they are recorded because each is a shape of mistake this design invites.

- **The daily full sync ran exactly once, ever.** `last_full_sync` was stamped after *every*
  successful roster pass, so each half-hourly delta pushed the deadline another 20 hours out. A full
  snapshot is the only pass that reconciles a **hard-deleted** student — the server has no row left
  to report them with — so the entire mark-and-prune mechanism was dead code after the first boot,
  and a deleted student would have kept opening the gate indefinitely. Only a full run stamps it
  now. The same check also refuses to ask for a full snapshot while a pass is **part-finished**,
  because doing so throws away the resume cursor: on a link slow enough to need several attempts,
  that restarted the same first sync forever.
- **The seed-bundle import had no reachable caller.** The button lived on the pairing screen, which
  renders only when the device is *unpaired*, and the handler required a *paired* device — so it
  always answered "pair this kiosk first". A ZIP reader, an artisan command and a documented install
  path, none of which had ever run. Hence the two-step pairing screen above; the import is now
  verified end to end (4 students, 1 photo, keys matching the roster).
- **Photos were stored twice and never reclaimed.** Nothing pruned a face once its student left or
  their picture was replaced, on a device that had just asked the browser to make its storage
  *persistent* — a slow leak with no upper bound on an SD card. `prunePhotos()` now runs after every
  full snapshot and seed import. Separately, the kiosk fetches photos with `cache: 'no-store'`
  against an endpoint that advertises `immutable, max-age=1y`: **the kiosk is the cache**, and
  letting Chromium keep its own copy meant ~90 MB of thumbnails held twice.
- **A response replayed from the HTTP cache has no readable headers.** Verified in Chromium: a
  cache hit on the photo endpoint arrives with neither `Date` nor `ETag` readable, even with both in
  `exposed_headers` — so a cached photo silently lost its content hash *and* cost the device a
  chance to learn what time it is. `no-store` fixes both, and `ETag` is now exposed and used as the
  key a face is filed under, with the roster's hash as the fallback. `GatePhotoTest` asserts the
  exposure, because this is the second time an unexposed header has silently disabled a feature.

Two smaller ones, same review: the kiosk's own **wall clock** was drawn from `new Date()` while
scans were stamped with `correctedNow()` — the 6.5rem display was the one number on the device that
ignored the clock correction; and the photo pass **reported progress after every single photo**,
each report re-reading the whole roster out of IndexedDB, which on 3,000 students is 3,000 full
reads on the main thread during the slowest pass the kiosk runs. Progress is now throttled and
counted in memory, and a full disk (`QuotaExceededError`) stops the pass instead of retrying it
2,000 more times.

### The case-folding bug the review missed

Found in the field, on a real gate: a card resolved **online but not offline**, so the screen showed
the student's name — from the server's reply — above the placeholder silhouette, because nothing
local had matched and there was no cached photo to inherit.

`student_rfid_tags.rfid_uid` is a `utf8mb4_unicode_ci` column. The server's
`where('rfid_uid', $value)` does no case folding, but **its collation does**, and it ignores trailing
spaces too. An IndexedDB index matches bytes. So a reader emitting a case other than the enrolled one
worked everywhere in the system except the local roster — and the comment in `resolve.ts` argued
*for* exact matching on the premise that the server was strict, which is true of the query and false
of the column.

The local copy has to be **at least as permissive as the server**, or the network stays load-bearing
for the cards that differ. `normalizeUid` now folds case and trailing spaces, `putStudents` derives a
`uid_keys` field from it, and lookups go through a `by_uid_key` index. Checked pair by pair against
MySQL: the folding agrees on case, trailing space, leading space, truncation and zero-padding, and
diverges only on accent folding (`ábc` = `abc` in the collation, not in JS) — deliberately left
stricter, because matching *less* than the server costs a fallback to the server while matching
*more* would resolve a card locally that ingest then rejects.

The QR fallback had the same flaw: `students.id` is also `_ci`, so an upper-case UUID resolved on the
server and missed a byte-exact keyPath lookup.

`DB_VERSION` went to 3 for the new index, and the upgrade **backfills `uid_keys` across the rows
already on the device**. A new multiEntry index over a field no existing row carries is an empty
index — without the backfill, an upgraded kiosk would have resolved nothing at all until its next
full sync, which is the one thing the version bump exists to avoid.

### The offline modules

`app/src/pages/Gate/offline/`:

- **`db.ts`** — IndexedDB wrapper, **no new dependency**. Stores: `students` (keyed by id, with a
  `multiEntry` index over `rfid_uids` so a student holding several cards resolves from any of
  them), `photos` (blobs keyed by `photo_hash`), `meta` (cursor, clock offset, sync marks). Also
  calls `navigator.storage.persist()`, without which Chromium may evict ~90 MB of faces under
  SD-card pressure and silently undo the feature. The `outbox` store (DB version **2** — bumped, not
  recreated, so a fielded kiosk keeps the cache it spent a day filling) holds scans that exist
  nowhere else yet.
- **`client.ts`** — the device-token HTTP client. **Deliberately not the shared axios instance**,
  which carries the staff user's token and redirects to `/login` on a 401. A 401 here wipes the
  local roster instead, which is what a revoked device should do.
- **`sync.ts`** — roster deltas (resumable at page granularity, so a kiosk that loses power partway
  through a 3,000-student first sync resumes rather than restarting) and the background photo pass,
  three at a time. **Roster completes first, always**: the kiosk is a fully working gate the moment
  it does, faces or no faces. A device that never finishes the photo pass still records every scan
  correctly.
- **`resolve.ts`** — both server paths reproduced: active tag UID, and the QR fallback that treats
  the scanned value as a student UUID. UID matching is **exact**, because normalising locally would
  resolve cards the server then rejects — the exact mismatch this feature exists to avoid.
- **`seed.ts`** — reads the USB bundle. ~150 lines and no zip library, because `ZipStreamWriter`
  only ever writes STORE entries. Never loads the archive: entries are `File.slice()` views, so a
  90 MB bundle costs a few kilobytes of parsing. Refuses a bundle built for another device or
  school — a kiosk that swallowed the wrong campus would resolve taps against strangers and look
  like it was working.
- **`outbox.ts`** — the write path. Queues a tap, uploads it, and deletes a row only when the
  server names it. Batches of 50 against a server cap of 200, because the point of a small batch is
  that a bad link can finish *one*: a device returning with 900 scans gets 18 acknowledged uploads
  rather than one request that has to survive end to end.
- **`clock.ts`** — the offset, persisted so a reboot starts corrected. See below.
- **`useGateSync.ts`** — schedules everything: delta every 30 min, heartbeat every 2 min, a **full**
  snapshot once a day (the only pass that reconciles a hard-deleted student), and a catch-up the
  moment the link returns. Nothing here can block a tap. It also owns `recordScan`, so the kiosk page
  has one way to write a scan and the pending count stays consistent. **Scans drain before the photo
  pass** — a scan waiting to upload matters more than a face waiting to arrive — and a heartbeat that
  succeeds triggers a drain, since it has just proved the link works.

Plus `GatePairing.tsx` (code entry + seed import) and `GateStatusChip.tsx`, which shows roster
count, photo backlog, and sync state. **Offline reads as a quiet grey note, not an error** — the red
card stays for a genuinely unrecognised tag. What does get amber is a device whose clock has never
been set.

### Clock drift is a first-class hazard

A Pi has no RTC. Boot with no internet and every queued `scanned_at` is wrong — and these rows
feed attendance, where the API already stores everything in **UTC** and a wrong wall-clock day is
unrecoverable after the fact. So: capture the server `Date` header on every successful call into a
stored offset, stamp queued scans with the corrected time, and **flag scans taken before the first
successful sync** so they arrive visibly suspect rather than quietly wrong.

All three are built. Verified by cold-booting a paired kiosk with the API down and its stored offset
deleted: the gate still resolved and queued the tap, the chip said *clock not set*, and the row
arrived with `clock_suspect` set. **Not yet surfaced in the portal** — the column is written and
nothing reads it. That is phase 5, and until then a doubtful timestamp is only visible in the
database.

### Unrecognised taps are queued too — **built**

A tag registered *after* the last sync is unknown to the device but known to the server. Rather
than dropping it, the kiosk queues the raw UID with no student and lets `/gate/scans` resolve it at
ingest.

What the display says depends on whether anyone can name the student, which is the honest test:

- **Online** — the reply carries the name, so the card is a normal welcome. Verified: a card issued
  after the device's last sync drew the right student with the local roster genuinely not knowing it.
- **Offline** — nobody can name them, so the card is red and says "not recognised", with a second
  line: *saved on this kiosk — it will upload when the link returns*. The refusal is about what the
  device knows; the note is about what happened to the record.

---

## Portal — **built**

`GateDevicesCard`, mounted on both tabs of the Gate Entries page rather than living on a page of
its own. Deliberate: the card belongs beside the gate it configures, and it needs no new sidebar
entry, no new route, and no new module slug — the same reasoning that put `GateSmsCard` there.

Each row shows presence, whether the device is paired, how many students it says it has cached,
how many scans are still waiting to upload, and an amber line when its clock is far enough out to
distrust its timestamps. A `both`-gate device appears on both tabs, since it answers for either
direction. A gate with no device registered says so plainly — that is the normal state for a school
that has not been provisioned yet, not a misconfiguration.

Two more surfaces landed in phase 5, both answering "the database knows something nobody can see":

- **`GateUnresolvedCard`** — the worklist above, on both tabs, filtered to that gate. It **renders
  nothing when empty**, which is the normal state: a permanent "0 unmatched cards" panel trains
  people to stop reading the page. Each row is the UID, how many times it tapped, how long ago, and
  a Dismiss button.
- **`time unverified`** beside a scan's timestamp in the log table, from `clock_suspect`. This is the
  point of the flag: a kiosk that had never reached a server still records attendance, and the row it
  writes must not look as authoritative as one from a device that knew the date.

The **late cut-off** is editable on the SMS card next to the existing cooldown, so a school can
lengthen it, shorten it, or set `0` to always send. It defaults to 15 minutes and existing gates
inherit that.

---

## SMS implications

**Built.** `GateSmsNotifier::notify()` fires on insert, so a replayed batch would text parents hours
late. The late check runs **before** `withinCooldown` — before the student lookup too, since a
backlog arrives here in bulk and this is the cheapest way to say no: skip and log when
`now() - scanned_at > late_threshold_minutes`. Measured against the *server's* clock deliberately,
because `scanned_at` may have come from a device that had no idea what time it was.

The scan is still recorded; only the text is dropped. A parent told at 3pm that their child arrived
is not receiving a late notification, they are receiving a false one, and a school cannot un-send
it.

Two existing constraints still hold and are easy to break here: `notify()` **never throws** (a gate
scan must not fail because of SMS), and it **does not hydrate relations onto `$log`** because
`kioskScan` serialises that model into a public response and `student.profile` carries the contact
number. Batch ingest must preserve both — it is now inserting many rows in a loop, so a single bad
row must not abort the batch.

---

## Rollout

Each phase deploys on its own. The cutover is a single step, at phase 4.

1. ~~**Device identity.**~~ **Done.** `gate_devices` migration, model, `auth.gate.token`, `pair` +
   `heartbeat`, admin CRUD, and a **Kiosk devices** card on each tab of the Gate Entries page.
   **Kiosk behaviour is unchanged** — the card says as much when a gate has no device registered,
   and `/gate-enter?institution_id=…` keeps working. Nothing calls `pair` or `heartbeat` yet; the
   surface exists so phases 2–4 have an identity to hang off.
2. ~~**Roster + photo endpoints.**~~ **Done.** `GateRosterSnapshot`, `GatePhotoThumbnail`,
   `ZipStreamWriter`, `gate:seed-snapshot`, and the two device-facing GETs. Verified with `curl`
   against real R2 and by unzipping a seed bundle; nothing on the kiosk calls them yet.
3. ~~**Local cache, read path only.**~~ **Done.** The kiosk resolves and renders from IndexedDB but
   **still POSTs online**, so a wrong cache is visible immediately without a single scan being at
   risk. Pairing screen, seed import, sync scheduling, status chip, and the clock correction all
   land here.
4. ~~**Outbox + batch ingest.**~~ **Done.** `client_scan_id` + `clock_suspect`, `POST /gate/scans`,
   `offline/outbox.ts`, and the kiosk write path cut over to it. **SMS late suppression came with
   it** rather than waiting for phase 5, because this is the phase that makes a late insert
   possible. Verified against a genuinely stopped API: taps queue and the card says so, the backlog
   uploads with the **time of the tap** rather than the time of the upload, a replayed batch records
   nothing twice, an unresolvable card is refused terminally and logged, and a cold boot with no
   clock produces flagged rows.
5. ~~**Display.**~~ **Done.** `gate_unresolved_scans` + its two admin endpoints and the
   `GateUnresolvedCard`; the `time unverified` marker in the scan log; the late cut-off exposed on
   the SMS card. Verified in the portal: a repeated unregistered card showed as one row reading
   "2 taps · last 3m ago", the entrance tab did not show an exit-gate card, dismissing removed the
   row from the page and the database, the marker appeared on the flagged scan and not the clean one
   beside it, and a changed cut-off persisted.

---

## Non-goals and known gaps

- **Boot still needs the network.** Decided deliberately, but know the exact failure mode: a power
  cut that reboots the Pi while the link is down leaves the gate down until the link returns —
  *even though a complete roster is sitting in IndexedDB*. Closing this needs a `fetch`-handling
  service worker scoped to the gate routes (a **separate** file from `sw.js`, whose no-fetch
  promise is deliberate) plus a build-time precache manifest, or nginx on the Pi serving the
  bundle. Deferred until it actually bites.
- **New exposure on the device.** Names, sections, and photos for 3,000+ students now sit on an SD
  card at a gate. Mitigated by thumbnails only, **no mobile numbers and no LRN** in the roster
  payload, revocable tokens, and purge-on-401. It is still a real change in posture and the schools
  should be told.
- **No auto-update for kiosk devices.** Same gap the SMS agent has.
- **An unresolved tap is a card, not an event.** The worklist keeps a count and a last-seen time per
  card, not one row per tap, so "which cards need registering" is answerable and "exactly when did
  each unknown tap happen" is not. The log still has the individual events.
- **Nothing prompts the office to look.** The worklist appears on the Gate Entries page and nowhere
  else — no badge in the sidebar, no notification. A school that never opens that page will not see
  it.
- **A neighbouring school's tag resolves later, not locally.** `kioskScan`'s tag lookup does not
  check the institution at all today, so a card from another school currently resolves at any gate.
  The roster is institution-scoped — a kiosk has no business holding another school's students — so
  such a tap is unknown on the device and waits for the server to resolve it at ingest. The scan is
  not lost and behaviour is preserved; only the moment of resolution moves. Whether that lookup
  *should* be institution-scoped is a separate question, and changing it would change existing
  online behaviour.
- **The QR fallback path** (raw student UUID instead of an RFID UID) must be reproduced in the
  local resolver, or QR users silently lose offline support.
- ~~**Photos are never pruned.**~~ Fixed in the phase-3 review: `prunePhotos()` runs after every
  full snapshot and after a seed import, dropping any face no roster row refers to.
- **A revoked device's queued scans go with the wipe.** A 401 purges everything including the
  outbox. Defensible — a revoked token cannot upload them anyway, and leaving a school's attendance
  on an untrusted kiosk is worse — but it does mean revoking a device mid-outage discards whatever
  it was holding. Unpair *after* the link is back if the queue matters.
- **An unbounded queue.** A kiosk offline for days keeps accepting taps rather than refusing them:
  dropping a student's scan is never the better trade. The staleness is made visible instead — the
  chip shows the pending count, and reads `roster Nd old` past 26 hours — but nothing stops a very
  long outage from accumulating a very large queue.
