# Module: Announcements

> Context doc for working on or integrating with the **Announcements** module.
> Two surfaces: **Announcements** (the read/feed board, all roles) and **Manage Announcements**
> (the authoring page, teachers + admins). Use the [file map](#file-map) below to jump straight
> to whatever a new feature touches.

Location in nav: **Communication → Announcements** (`/announcements`, everyone) and
**Communication → Manage Announcements** (`/announcements/manage`, `subject-teacher` + admins).
Everything is **institution-scoped** (resolved from the authenticated user's default institution,
or the student's active institution).

Admin roles (see everything, post anywhere): `super-administrator`, `principal`,
`institution-administrator`. Everyone else who can author (`subject-teacher`) is a **restricted
author** — forced to `audience=students`, `scope=sections`, and may only target sections they
advise or teach a subject in.

---

## Core concept

An **Announcement** is an institution-scoped post with a `title`, rich-text `body`, and optional
attachments. Three axes control who sees it and when:

- **audience** — `students` | `teachers` | `both`. Teacher-authored posts are always `students`.
- **scope** — `institution` (everyone) | `grade_levels` (rows in `announcement_grade_levels`) |
  `sections` (rows in `announcement_sections`). Teacher-authored posts are always `sections`.
- **status / schedule** — `draft` is never visible. A `published` row is live only when
  `publish_at` is null or in the past AND `expires_at` is null or in the future. A published row
  with a future `publish_at` shows as **"Scheduled"** in the manage list (computed client-side —
  there is no `scheduled` enum value).

**Reads** are tracked per viewer in `announcement_reads` (one row per `(announcement, reader_type,
reader_id)`), which powers the unread badge and the "New" pill. A viewer can be a **user** (staff)
or a **student** (student-portal), distinguished by `reader_type`.

Attachments live on the **r2** disk and are served via **7-day temporary URLs** — never store or
cache the `url` field long-term; re-fetch it.

---

## File map

**Backend (`api/`)**
- Migrations: `database/migrations/2026_06_28_000003_create_announcements_table.php` (+ `..._000004` sections, `..._000005` grade_levels, `..._000006` attachments, `..._000007` reads).
- Models: `app/Models/Announcement.php`, `AnnouncementAttachment.php`, `AnnouncementGradeLevel.php`, `AnnouncementRead.php`, `AnnouncementSection.php` (pivot).
- Service: `app/Services/AnnouncementService.php` — viewer resolution + visibility query + `staffSectionIds`.
- Controller: `app/Http/Controllers/AnnouncementController.php` — authoring, attachments, feed, read-tracking.
- Routes: `routes/api.php` lines 422–431 (inside the `auth.token` group).

**Frontend (`app/`)**
- Read/feed: `src/pages/Announcements/AnnouncementBoard.tsx`.
- Authoring: `src/pages/Announcements/AnnouncementsManage.tsx`.
- Service: `src/services/announcementService.ts`.
- Types: `src/types/index.ts` lines ~1806–1876.
- Routes: `src/App.tsx` (`announcements`, `announcements/manage`). Nav + unread badge: `src/components/sidebar/Sidebar.tsx` (Communication group).
- Dashboard widget: `src/pages/Dashboard.tsx` (`RecentAnnouncements`).

---

## Data model

### `announcements`
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid | FK → institutions, cascade |
| author_id | uuid nullable | FK → users, nullOnDelete |
| author_role | string nullable | snapshot of author's role slug at creation (avoids a join for "Posted by") |
| title | string | |
| body | longText nullable | rich-text HTML |
| audience | enum | `students` \| `teachers` \| `both`, default `students` |
| scope | enum | `institution` \| `grade_levels` \| `sections`, default `institution` |
| is_pinned | bool | default false |
| status | enum | `draft` \| `published`, default `published` |
| publish_at | timestamp nullable | future value ⇒ "scheduled" (gated at query time) |
| expires_at | timestamp nullable | past value ⇒ hidden |
| timestamps | | |

Indexes: `(institution_id, status)`, `(institution_id, is_pinned)`, `(publish_at)`, `(expires_at)`.

### `announcement_sections` — targeting rows when scope=`sections`
`id`, `announcement_id` (FK cascade), `class_section_id` (FK cascade), timestamps.
Unique `(announcement_id, class_section_id)`; index `(class_section_id)`.

### `announcement_grade_levels` — targeting rows when scope=`grade_levels`
`id`, `announcement_id` (FK cascade), `grade_level` **string** (matches `class_sections.grade_level`,
which is a free string, not an FK), timestamps. Unique `(announcement_id, grade_level)`.

### `announcement_attachments`
`id`, `announcement_id` (FK cascade), `file_path` (r2 object key), `file_name`, `mime_type` nullable,
`size` unsignedBigInt nullable, timestamps. Index `(announcement_id)`.

### `announcement_reads` — one row per reader per announcement
`id`, `announcement_id` (FK cascade), `reader_type` enum(`user`,`student`), `reader_id` uuid,
`read_at` timestamp nullable, timestamps. Unique `(announcement_id, reader_type, reader_id)`;
index `(reader_type, reader_id)`.

---

## Eloquent models
- `Announcement` — `HasUuids`. Relationships: `institution()`, `author()`, `sections()` (belongsToMany
  via `announcement_sections`, pivot `AnnouncementSection`, withTimestamps), `gradeLevels()` (hasMany),
  `attachments()` (hasMany), `reads()` (hasMany). Casts: `is_pinned`→bool, `publish_at`/`expires_at`→datetime.
  **Enum values live in the migration + validation only — no model constants.**
- `AnnouncementAttachment` — `announcement()`; `size`→int.
- `AnnouncementGradeLevel` — `announcement()`.
- `AnnouncementRead` — `announcement()`; `read_at`→datetime.
- `AnnouncementSection` — extends `Pivot`, `HasUuids`, non-incrementing string key.

---

## API

All routes are inside the `auth.token` group in `routes/api.php`. Responses use `{ success, message?, data }`.
The feed/unread-count/read/attachment routes are declared **before** `apiResource` so the
`{announcement}` wildcard doesn't swallow them.

### Authoring (teachers + admins) — `apiResource('announcements')`
| method | path | action | notes |
|---|---|---|---|
| GET | `/api/announcements` | `index` | manageable list; students 403. Admins → all in institution; teachers → `author_id = self`. `?search=` LIKE on title. Includes `withCount('reads')`. |
| POST | `/api/announcements` | `store` | validate → `resolveTargeting` → create (sets `author_id`, `author_role`) → `syncTargeting`. 201. |
| GET | `/api/announcements/{id}` | `show` | one manageable record (`findManageable`). |
| PUT/PATCH | `/api/announcements/{id}` | `update` | validate → resolveTargeting → update → syncTargeting. |
| DELETE | `/api/announcements/{id}` | `destroy` | deletes each attachment's stored file (best-effort) then the row. |

### Attachments
| method | path | action | notes |
|---|---|---|---|
| POST | `/api/announcements/{id}/attachments` | `uploadAttachment` | `file` required, ≤100MB, mimes: pdf/images/office/txt/video/audio. Stored at `{institution_id}/announcements/{announcement_id}/{uuid.ext}` on r2. 201. |
| DELETE | `/api/announcements/{id}/attachments/{attachmentId}` | `deleteAttachment` | 404 if not found. |

### Viewer feed + read tracking (all roles, incl. students)
| method | path | action | notes |
|---|---|---|---|
| GET | `/api/announcements/feed` | `feed` | `visibleQuery` for the resolved viewer, with attachments+author; each item carries `is_read`. |
| GET | `/api/announcements/unread-count` | `unreadCount` | `{ count }` — visible announcements with no read row for this reader (0 if no viewer). |
| POST | `/api/announcements/{id}/read` | `markRead` | only for announcements the viewer can see (else 404); `updateOrCreate` a read with `read_at = now()`. |

### Serialization
- `serialize` — full author shape (used by manage endpoints): id, institution_id, title, body, audience,
  scope, is_pinned, status, publish_at, expires_at, author_id, author_role, author_name, `read_count`,
  `section_ids`, `sections`, `grade_levels`, `attachments`, timestamps.
- `serializeForViewer` — trimmed feed shape: id, title, body, is_pinned, audience, author_role,
  author_name, `is_read`, publish_at, attachments, created_at.
- `serializeAttachment` — `{ id, name, mime, size, url }` where `url` is a **7-day temporary r2 URL**.

---

## Visibility rules (the important part)

`AnnouncementService` owns "who can see what". When adding any feature that surfaces announcements to
a viewer, **route through `visibleQuery`** rather than re-implementing the filters.

- `resolveViewer(Request)` → `{ kind, institution_id, user_id, student_id, section_ids, grade_levels }`
  or null. Dispatches to student vs staff.
- `visibleQuery(viewer)` filters: institution match; `status=published`; `publish_at` null or ≤ now;
  `expires_at` null or > now; audience matches viewer kind (`students`/`both` for students,
  `teachers`/`both` for staff); then scope — `institution` always, `sections` intersect the viewer's
  `section_ids`, `grade_levels` intersect the viewer's `grade_levels`. Empty lists use a `['__none__']`
  sentinel so they match nothing. Ordered `is_pinned` desc, `publish_at` desc, `created_at` desc.
- `staffSectionIds($user, $institutionId)` — sections a staff member is tied to: **sections they advise**
  (`class_sections.adviser = user.id`) **∪ sections of subjects they teach** (`advisedSubjects()` with a
  non-null `class_section_id`). This is the canonical "sections a teacher belongs to" set — used both by
  the staff viewer and by write-side authoring guards.

### Authoring guards — `resolveTargeting` (controller)
- Admins keep the submitted `audience`/`scope`.
- Non-admins are forced to `audience=students`, `scope=sections`.
- `scope=sections`: ≥1 section required; all must belong to the institution; for teachers they must
  intersect `staffSectionIds` ("You can only post to sections you advise or teach").
- `scope=grade_levels`: ≥1 grade level required.
- Returns the resolved array, or a 422 `JsonResponse` on failure.
- `syncTargeting` full-replaces the sections pivot and recreates grade-level rows.

---

## Frontend

### Announcements board — `AnnouncementBoard.tsx` (`/announcements`, all roles)
Fetches `getFeed()` via React Query key `['announcement-feed']`, renders `AnnouncementCard`s: pin icon,
title, "New" pill when unread, role label + author + date, HTML body via `dangerouslySetInnerHTML`
(bodies are authored by trusted staff), attachment links. Clicking an unread card fires `markRead`,
invalidating `['announcement-feed']` + `['announcement-unread-count']`. Has loading/empty states.
`Dashboard.tsx` also renders a `RecentAnnouncements` widget (top 5 from the feed).

### Manage announcements — `AnnouncementsManage.tsx` (`/announcements/manage`, teachers + admins)
Local `ADMIN_ROLES` (same three slugs) drives `isAdmin`, which toggles the whole form:
- **Admins**: audience + target (scope) selectors, grade-level picker, section picker sourced from
  `classSectionService.getClassSectionsByInstitution`; list titled "All announcements".
- **Teachers**: locked to `students`/`sections`; section picker sourced from
  `userService.getMyClassSections({ include_taught: true })` → **sections they advise or teach**; list
  titled "Your announcements".

Form fields: title, `RichTextEditor` body, audience, scope, section/grade pickers, status,
`publish_at`/`expires_at` (datetime-local), `is_pinned`, attachments. New announcements upload pending
files after create; while editing, attachment upload/delete is live. List rows show a client-computed
status badge (Draft/Expired/Scheduled/Published), audience label, scope summary, read count, attachment
count, and edit/delete.

### Service — `announcementService.ts` (baseUrl `/announcements`)
`getAnnouncements({search?})`, `createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement`,
`uploadAttachment(id, file)` (FormData), `deleteAttachment(id, attachmentId)`, `getFeed`,
`getUnreadCount`, `markRead(id)`.

### Types — `src/types/index.ts`
`AnnouncementAudience`, `AnnouncementScope`, `AnnouncementStatus`, `AnnouncementAttachment`,
`AnnouncementSectionRef`, `Announcement` (full manage shape), `AnnouncementFeedItem` (trimmed feed
shape), `CreateAnnouncementData`.

### React Query keys
- `['announcement-feed']` — board + dashboard widget.
- `['announcement-unread-count']` — sidebar badge (polls every 60s).
- `['announcements-manage']` — manage list.
- `['announcement-sections', isAdmin]` — section picker source.
- `['announcement-grade-levels']` — grade-level picker (admin only, `enabled: isAdmin`).

Invalidation: the manage page's `invalidate()` refreshes manage + feed + unread-count; board `markRead`
invalidates feed + unread-count.

### Unread badge / notifications
The only notification surface is the sidebar badge on the **Announcements** item
(`Sidebar.tsx`): a `['announcement-unread-count']` query with `refetchInterval: 60000`, rendered as an
indigo pill (`99+` cap) only when `count > 0`. There is **no push/email notification system**.

---

## Integrating from other modules

**"Show announcements to the current viewer"** — call the feed, don't re-query the table:
`GET /api/announcements/feed` (frontend `announcementService.getFeed()`). It already applies institution,
schedule, audience, and scope filtering for the authenticated user/student.

**"Does viewer X have unread announcements?"** — `GET /api/announcements/unread-count`.

**Server-side** — resolve a viewer with `AnnouncementService::resolveViewer($request)` and query with
`visibleQuery($viewer)`; never hand-roll the status/publish/expires/audience/scope filters.

### Conventions to respect
- Everything is institution-scoped (mirror `resolveInstitutionId`).
- Enum values are defined only in the migration + `validatePayload` — keep those two in sync; there are
  no model constants to lean on.
- Attachment `url`s are 7-day temporary r2 URLs — re-fetch, don't persist.
- `grade_level` is a free string, matched by value against `class_sections.grade_level` (no FK).
- Restricted authors (non-admins) can only target sections in `staffSectionIds` — enforce on the write
  path (`resolveTargeting`), and source any teacher section picker from the same set.

---

## Not yet wired (good follow-ups)
- No push/email/in-app notifications beyond the polling sidebar badge.
- No per-viewer dismiss/archive — only read/unread.
- No comments, reactions, or acknowledgement receipts (reads are the only engagement signal).
- Grade-level targeting is string-matched, so a renamed grade level silently stops matching old rows.
- No recurring/repeat scheduling — a single `publish_at`/`expires_at` window per announcement.
