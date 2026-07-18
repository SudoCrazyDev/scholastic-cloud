# Module: Finance Announcements

> Context doc for working on or integrating with **Finance Announcements** — the finance office's
> announcements channel (payment reminders, due dates, cashier hours). It is a thin authoring
> surface **on top of the [Announcements](../../Announcements/ANNOUNCEMENTS.md) module**, not a
> separate data model: read that doc first for tables, visibility rules, attachments, and read
> tracking. This doc covers only what Finance Announcements adds.

Location in nav: **Finance → Announcements** (`/finance-announcements`), a standalone page like
Payment Plans — **outside** the `/finance/*` tab shell. Sidebar `allowedRoles`:
`super-administrator`, `principal`, `institution-administrator`, `finance` (same as the other
Finance links; the `finance` role sees only the Finance sidebar group).

---

## Core concept

A finance announcement is a normal `announcements` row with **`category = 'finance'`**. The one
rule that defines the module:

> **Finance announcements are always for all students.** The server forces
> `audience = 'students'` and `scope = 'institution'` whenever `category = 'finance'` — on create
> *and* update, regardless of what the payload says. There are no targeting controls in the UI.

Students see finance posts on the regular **Announcements board** (`/announcements`) through the
untouched feed/visibility pipeline — no board or feed changes were needed. Read tracking, the
unread sidebar badge, pinning, draft/scheduled/expired status, and attachments all work exactly as
documented in the Announcements doc.

**`category`** (`announcements.category`, string, default `'general'`) records which authoring
surface owns the post:

- `general` — the Communication → Manage Announcements page (teachers + admins).
- `finance` — the Finance → Announcements page.

Who can author `finance` posts (enforced in `resolveTargeting`):

| role | category rules |
|---|---|
| `finance` | **Always** `finance` — everything they post goes to all students. (Before this module, a finance user could not author at all: the teacher fallback requires owned sections.) |
| admins (`super-administrator`, `principal`, `institution-administrator`) | May pass `category: 'finance'` (the Finance page does); otherwise an update keeps the row's existing category, and a create defaults to `general`. |
| teachers (`subject-teacher`) | Forced to `general` — accepting `finance` from them would grant an institution-wide audience and bypass their sections-only restriction. |

Management visibility is unchanged: the `finance` role is a **restricted author** (sees/edits only
their own posts); admins see every announcement in the institution — finance posts also appear in
their Manage Announcements list.

---

## File map

**Backend (`api/`)** — all shared with Announcements; the delta:
- Migration: `database/migrations/2026_07_18_000005_add_category_to_announcements_table.php` —
  adds `category` (string, default `'general'`) + `(institution_id, category)` index.
- Model: `app/Models/Announcement.php` — `category` in `$fillable`.
- Controller: `app/Http/Controllers/AnnouncementController.php` —
  - `resolveTargeting()` resolves `category` and forces `students`/`institution` for finance posts
    (see the table above for who may set it);
  - `store`/`update` persist `$resolved['category']`; `update` passes the row's current category in
    so an admin edit without the field doesn't reset it;
  - `index` accepts `?category=` (`all` | `general` | `finance`);
  - `serialize` includes `category`. `isFinance()` helper mirrors `isAdmin()`.
- Routes: unchanged (`routes/api.php` announcements block).

**Frontend (`app/`)**
- Page: `src/pages/Finance/FinanceAnnouncementsView.tsx` — a trimmed copy of
  `AnnouncementsManage.tsx`: title, rich-text body, status, publish/expires, pin, attachments, and
  a status-filterable list. No audience/scope/section/grade pickers; the payload hardcodes
  `category: 'finance'`, `audience: 'students'`, `scope: 'institution'`.
- Service: `src/services/announcementService.ts` — `getAnnouncements` gained a `category?` param.
- Types: `src/types/index.ts` — `AnnouncementCategory`; `category` on `Announcement` (required)
  and `CreateAnnouncementData` (optional).
- Route: `src/App.tsx` — `finance-announcements` renders `<FinanceAnnouncementsView />` directly.
- Sidebar: `src/components/sidebar/Sidebar.tsx` — Finance group, item `finance-announcements`
  (Megaphone icon) directly below Payment Plans.

---

## API delta

Same endpoints as Announcements. What changed:

- `GET /api/announcements?category=finance` — the Finance page's list query (combined with the
  existing `?status=` filter). Omitting `category` (or `all`) returns everything, so the Manage
  Announcements page is unaffected.
- `POST` / `PUT` accept optional `category` (`general` | `finance`), validated in
  `validatePayload`, then resolved per the role table above. Payload `audience`/`scope` are still
  **required** fields — the Finance page sends `students`/`institution`, and the server would
  force those values anyway.
- `serialize` now returns `category`; `serializeForViewer` (the student feed shape) does **not**
  include it — the board renders finance posts like any other.

### React Query keys
- `['finance-announcements', statusFilter]` — the page's list (invalidated by prefix).
- Mutations also invalidate `['announcements-manage']`, `['announcement-feed']`, and
  `['announcement-unread-count']`, since finance posts surface on those.

---

## Integration

- **Everything in the Announcements doc applies** — visibility via
  `AnnouncementService::visibleQuery`, attachments as 7-day r2 URLs, read rows in
  `announcement_reads`.
- To fetch finance posts specifically (server-side), filter `category = 'finance'` **on top of**
  `visibleQuery` — don't re-implement the status/schedule/audience filters.
- **Consumers**: the students' Announcements board and the Dashboard `RecentAnnouncements` widget
  show finance posts implicitly (they consume the feed). The admin Manage Announcements list shows
  them with audience "Students" / scope "Institution-wide". Nothing else reads `category` yet.

## Not yet wired

- No `category` filter or badge on the Manage Announcements page or the student board — finance
  posts are visually indistinguishable there (only `author_role` hints at the source).
- `serializeForViewer` doesn't expose `category`, so a "Finance" tag on the student board would
  need that field added first.
- No link between an announcement and finance data (e.g. auto-posts when a payment plan
  installment nears its due date) — all posts are manual.
