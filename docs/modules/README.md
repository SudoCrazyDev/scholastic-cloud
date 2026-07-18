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
- [Staff Schedules](HRIS/StaffSchedules/STAFF_SCHEDULES.md) — HRIS. Reusable schedule templates
  (weekly hours + lunch + per-day grace period), assigned to staff (one per staff), plus an
  institution calendar of holidays & events. Consumed by Payroll for lateness/undertime/overtime.

## Conventions
- One doc per module, named in `SCREAMING_SNAKE_CASE.md`. Group a suite's modules under a folder
  (`Announcements/`, `HRIS/<Module>/`); single-module areas can sit directly in `modules/`.
- Open with a **File map** listing every file/route/type the module touches, so an agent can find
  what to edit without re-discovering the layout.
- Keep an **Integration** section showing how other modules pull data from this one, and flag the
  live **consumers** so a schema change knows what it will break.
- Note anything **not yet wired** so future work doesn't assume it exists.
