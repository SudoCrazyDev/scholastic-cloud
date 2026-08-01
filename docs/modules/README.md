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
- [Finance Announcements](Finance/Announcements/FINANCE_ANNOUNCEMENTS.md) — Finance office's
  announcements channel (`/finance-announcements`, below Payment Plans in the sidebar). A thin
  surface over the Announcements module: posts get `category='finance'` and are **always for all
  students** (server-forced `audience=students`, `scope=institution`).
- [Tala](Tala/TALA.md) — AI teaching assistant. A streaming chat module (`/tala`) shipped to
  **subject teachers**, running on a key the tenant supplies — the school's key, or a teacher's own
  as the fallback. Claude or OpenAI, model picked from an allowlist. Has one read-only **tool**
  (`list_assigned_subjects`). **Read [Guardrails](Tala/TALA.md#guardrails) before adding a tool** —
  scope comes from the authenticated request, never from the model, and the institution-wide
  widening that `getMySubjects()` grants principals is deliberately not reproduced.
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

## Conventions
- One doc per module, named in `SCREAMING_SNAKE_CASE.md`. Group a suite's modules under a folder
  (`Announcements/`, `HRIS/<Module>/`); single-module areas can sit directly in `modules/`.
- Open with a **File map** listing every file/route/type the module touches, so an agent can find
  what to edit without re-discovering the layout.
- Keep an **Integration** section showing how other modules pull data from this one, and flag the
  live **consumers** so a schema change knows what it will break.
- Note anything **not yet wired** so future work doesn't assume it exists.
