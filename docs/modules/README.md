# Module Docs

Context docs for individual feature modules. Read the relevant file before working on or
integrating with a module — each one covers its data model, API, frontend, and how other
modules should consume its data.

## Index
- [Announcements](Announcements/ANNOUNCEMENTS.md) — Communication. Institution-scoped posts targeted by
  audience/scope (institution, grade levels, sections), with attachments, scheduling, and per-viewer
  read tracking. Two surfaces: the **Announcements** board (all roles) and **Manage Announcements**
  (teachers + admins).
- [Finance](Finance/FINANCE.md) — Staff-facing student money: fee setup + default amounts,
  cashiering (POS with printed receipts), per-student ledgers/NOA, collections reports, three
  discount mechanisms, receipt templates, payment plans, and a payment-void approval queue. One
  page (`/finance/*`) with a grouped two-level nav; Payment Plans is a standalone sibling page.
- [Online Payments](Finance/ONLINE_PAYMENTS.md) — Finance. Taking money through a third-party
  provider. The point of the module is **whose merchant account it lands in**: credentials are
  per institution, encrypted, and set only by the platform (`payment-gateways` is `system_only`) —
  never in `.env`, because two schools on one server are never the same merchant. Provider catalog
  in `config/payments.php` + a `PaymentGatewayDriver` per provider; **only Maya (PayMaya) has a
  driver today**. Webhooks are public, signature-verified per school, and routed by a random slug.
  Read before adding a provider, touching `PaymentWebhookController`, or changing how a completed
  payment posts to the ledger.
- [Finance Announcements](Finance/Announcements/FINANCE_ANNOUNCEMENTS.md) — Finance office's
  announcements channel (`/finance-announcements`, below Payment Plans in the sidebar). A thin
  surface over the Announcements module: posts get `category='finance'` and are **always for all
  students** (server-forced `audience=students`, `scope=institution`).
- [Tala](Tala/TALA.md) — AI teaching assistant. A streaming chat module (`/tala`) an administrator
  grants to **individual teachers** (`tala_access` — the one module a role cannot hand out), running
  on the **school's key**, which an administrator also sets. Teachers have no setup step at all.
  Claude or OpenAI, model picked from an allowlist. Six read **tools**
  (`list_assigned_subjects`, `list_lessons`, `get_lesson`, `read_lesson_material` — which opens a
  lesson's uploaded **images and PDFs**, bytes sent server-side so no signed media URL ever reaches
  the provider — `list_assessments`, `get_assessment`) plus
  `propose_assessment`, which drafts a quiz/assignment/exam for the teacher to approve — **the model
  has no write access; an approval card and an authenticated endpoint do the writing**, and it needs
  `subjects.manage` as well. **Read [Guardrails](Tala/TALA.md#guardrails) before adding a tool**:
  scope comes from the authenticated request, never from the model; the institution-wide widening that
  `getMySubjects()` grants principals is deliberately not reproduced;
  [Their records versus your knowledge](Tala/TALA.md#their-records-versus-your-knowledge) is why a
  missing tool has to be built rather than left for the model to fill in; and
  [the write path](Tala/TALA.md#the-write-path-nothing-the-model-says-changes-anything) is the pattern
  any future mutating tool must follow.
- [Staff Schedules](HRIS/StaffSchedules/STAFF_SCHEDULES.md) — HRIS. Reusable schedule templates
  (weekly hours + lunch + per-day grace period), assigned to staff (one per staff), plus an
  institution calendar of holidays & events. Consumed by Payroll for lateness/undertime/overtime.
- [Attendance Exceptions](HRIS/AttendanceExceptions/ATTENDANCE_EXCEPTIONS.md) — HRIS. How a day is
  paid differently from what the punches say: institution-wide suspensions / half-days with an
  early dismissal time and a pay treatment, plus per-staff requests (early out, excused late
  arrival, official business, missed punch) that a principal approves. Waives late/undertime
  penalties and can guarantee the full daily rate. Read before changing pay arithmetic.
- [Media & Uploads](Media/MEDIA.md) — Shared infrastructure, not a nav module. The layer under every
  uploaded file: assessment images, lesson and announcement attachments, student submissions, ID card
  assets, logos, profile pictures, documents, receipts. Private Cloudflare R2 bucket + permanent
  signed `/api/media` links via `MediaUrl`. **Read before adding an upload** (`MediaUrl::for()`, never
  `temporaryUrl()`), before changing `APP_URL`/`APP_KEY`/a tenant domain (run `media:repair-urls`
  after), or when files are broken in a deployed tenant — it has a
  [status-code → cause table](Media/MEDIA.md#diagnosing-a-broken-file).
- [SMS Gateway](SMS_GATEWAY/SMS_GATEWAY.md) — Communication. Sends/receives SMS over local prepaid
  SIMs via an on-prem **kiosk** (Raspberry Pi / Windows PC) with a USB GSM modem, managed entirely
  from the portal. Clones the HRIS bridge pattern: per-device agent, pairing-code → hashed token,
  heartbeat, pull-based outbox queue. Other modules send by calling `SmsService::queue()` — no
  producers wired yet. Three admin pages: **Gateways**, **Messages**, **Settings**.
- [Gate Kiosk — Offline Mode](GATE_KIOSK/OFFLINE_KIOSK_V1.md) — **Built.** The `/gate-enter` /
  `/gate-exit` kiosks on a slow or dead link: paired device tokens, a delta roster + thumbnail cache
  in IndexedDB, a USB seed bundle for a campus too large to sync, and an **idempotent scan outbox** —
  a tap is recorded on the device before anything touches the network and uploaded later carrying the
  time of the tap. Gate SMS **suppresses notifications for scans older than
  `late_threshold_minutes`** (default 15, editable per gate), which is what stops a backlog texting
  parents hours late. The portal shows each kiosk's cache/queue/clock, marks a scan whose timestamp
  the device could not vouch for, and lists **cards that tapped and could not be matched** so an
  unregistered tag stops being invisible. Unpaired kiosks keep working on `?institution_id=`.
  **Boot still needs the network** — see the known gaps. Read it before touching
  `RfidScanLogController::kioskScan`, `GateSmsNotifier`, or `app/src/pages/Gate/`.
  [Running a gate kiosk](GATE_KIOSK/RUNNING_A_GATE_KIOSK.md) is the operator-facing companion:
  register → pair → seed, what the office watches, and what each warning means. Hand that one to a
  technician or a school; the design doc is for us.

## Conventions
- One doc per module, named in `SCREAMING_SNAKE_CASE.md`. Group a suite's modules under a folder
  (`Announcements/`, `HRIS/<Module>/`); single-module areas can sit directly in `modules/`.
- Open with a **File map** listing every file/route/type the module touches, so an agent can find
  what to edit without re-discovering the layout.
- Keep an **Integration** section showing how other modules pull data from this one, and flag the
  live **consumers** so a schema change knows what it will break.
- Note anything **not yet wired** so future work doesn't assume it exists.
