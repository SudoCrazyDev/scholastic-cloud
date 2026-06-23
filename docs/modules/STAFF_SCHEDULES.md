# Module: Staff Schedules (HRIS)

> Context doc for working on or integrating with the **Staff Schedules** module.
> If another module needs a staff member's working hours / day-off / holiday status,
> read the [Integration](#integrating-from-other-modules) section.

Location in nav: **HRIS → Staff Schedules** (`/hris/staff-schedules`).
Visible to roles: `principal`, `institution-administrator`. Students are explicitly blocked.
Everything is **institution-scoped** (resolved from the authenticated user's default institution).

---

## Core concept

A **Schedule** is a reusable **template** — a name + description + weekly working hours
(per-day start/end, plus optional lunch). A template is **not** tied to a staff member.

Staff are linked to a template through an **assignment**. Rules:

- **One schedule per staff** (`unique(institution_id, user_id)` on the assignment table).
  Re-assigning a staff member replaces their previous assignment.
- **One schedule → many staff** (a template can be assigned to any number of people).
- A template's **days** define which weekdays are worked. **A weekday with no row = day off.**

A separate **Calendar** records institution-wide **holidays** and **events** per date
(multiple entries per day allowed). Holidays are currently **informational** — they are
surfaced in the UI but do **not** automatically mutate schedules/attendance (see
[Not yet wired](#not-yet-wired)).

---

## Data model

### `staff_schedules` — the template
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid | FK → institutions, cascade |
| name | string | unique per institution (`staff_schedules_institution_name_unique`) |
| description | text nullable | |
| is_active | bool | default true |
| created_by | uuid nullable | FK → users, nullOnDelete |
| timestamps | | |

### `staff_schedule_days` — per-weekday hours (child of template)
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| staff_schedule_id | uuid | FK → staff_schedules, cascade |
| day_of_week | string | one of `monday`..`sunday` (lowercase, full name) |
| start_time | time | stored `HH:MM:SS`, served as `HH:MM` |
| end_time | time | |
| lunch_start | time nullable | optional |
| lunch_end | time nullable | optional |
| timestamps | | |

`unique(staff_schedule_id, day_of_week)`. Days are **fully replaced** on every template write
(delete-all + recreate). **Absent weekday = day off.**

### `staff_schedule_assignments` — staff ↔ template
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid | FK → institutions, cascade |
| staff_schedule_id | uuid | FK → staff_schedules, cascade |
| user_id | uuid | FK → users, cascade |
| created_by | uuid nullable | |
| timestamps | | |

`unique(institution_id, user_id)` → one schedule per staff. Index on `staff_schedule_id`.

### `staff_calendar_events` — holidays & events
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| institution_id | uuid | FK → institutions, cascade |
| title | string | |
| description | text nullable | |
| type | string | `holiday` \| `event` |
| event_date | date | single day; **multiple entries per date allowed** (no unique constraint) |
| created_by | uuid nullable | |
| timestamps | | |

Index `(institution_id, event_date)`.

Migrations: `database/migrations/2026_06_18_000001_create_staff_schedules_table.php`
(schedules + days + assignments) and `..._000002_create_staff_calendar_events_table.php`.

---

## Eloquent models
- `App\Models\StaffSchedule` — `days()` (hasMany, ordered Mon→Sun), `assignments()` (hasMany), `creator()`, `institution()`.
- `App\Models\StaffScheduleDay` — `staffSchedule()`. `StaffScheduleDay::DAYS` = ordered weekday list; `dayOrderSql()` for Mon→Sun ordering.
- `App\Models\StaffScheduleAssignment` — `staffSchedule()`, `user()`, `institution()`.
- `App\Models\StaffCalendarEvent` — `creator()`, `institution()`. `StaffCalendarEvent::TYPES` = `['holiday','event']`.

Controllers: `App\Http\Controllers\StaffScheduleController`, `App\Http\Controllers\StaffCalendarEventController`.
All routes live in `routes/api.php` under the authenticated (`auth.token`) group.

---

## API

All responses use `{ success, message?, data }`. All endpoints are institution-scoped and reject students (403).

### Schedule templates
| method | path | body | notes |
|---|---|---|---|
| GET | `/api/staff-schedules` | — | `?search=`, `?is_active=` |
| POST | `/api/staff-schedules` | template | 201 |
| GET | `/api/staff-schedules/{id}` | — | |
| PUT | `/api/staff-schedules/{id}` | template | |
| DELETE | `/api/staff-schedules/{id}` | — | **409** if assigned to staff (unassign first) |
| POST | `/api/staff-schedules/{id}/assign` | `{ user_ids: string[] }` | upserts assignments → `{ created, reassigned, total }` |

Template request body:
```json
{
  "name": "Regular Office Hours",
  "description": "Mon–Fri 8–5",
  "is_active": true,
  "days": [
    { "day_of_week": "monday", "start_time": "08:00", "end_time": "17:00",
      "lunch_start": "12:00", "lunch_end": "13:00" }
  ]
}
```
Validation: `name` required & unique per institution; `days` required (≥1); `day_of_week` in the weekday
list and distinct; times `H:i`; `end_time > start_time`; lunch optional but if present both ends required,
within working hours, `lunch_end > lunch_start`.

Template response (`serialize`):
```json
{
  "id": "uuid", "institution_id": "uuid",
  "name": "Regular Office Hours", "description": null,
  "is_active": true, "assigned_count": 12, "day_count": 5,
  "days": [{ "id": "uuid", "day_of_week": "monday",
             "start_time": "08:00", "end_time": "17:00",
             "lunch_start": "12:00", "lunch_end": "13:00" }],
  "created_at": "…", "updated_at": "…"
}
```

### Assignments
| method | path | body | notes |
|---|---|---|---|
| GET | `/api/staff-schedule-assignments` | — | `?staff_schedule_id=` |
| DELETE | `/api/staff-schedule-assignments/{assignmentId}` | — | unassign one staff |

Assignment response:
```json
{ "id": "uuid", "user_id": "uuid", "staff_name": "Juan Dela Cruz",
  "staff_email": "…", "staff_schedule_id": "uuid",
  "schedule_name": "Regular Office Hours", "created_at": "…" }
```
> Note: the assignment payload does **not** include the schedule's days. To get hours, join to
> `/api/staff-schedules` (or `StaffSchedule::with('days')`) by `staff_schedule_id`.

### Calendar (holidays & events)
| method | path | body | notes |
|---|---|---|---|
| GET | `/api/staff-calendar-events` | — | `?from=YYYY-MM-DD&to=YYYY-MM-DD&type=` |
| POST | `/api/staff-calendar-events` | event | |
| PUT | `/api/staff-calendar-events/{id}` | event | |
| DELETE | `/api/staff-calendar-events/{id}` | — | |

Event body / response:
```json
{ "title": "Independence Day", "description": null,
  "type": "holiday", "event_date": "2026-06-12" }
```

---

## Frontend

- Page: `app/src/pages/HRIS/StaffSchedules.tsx` — single file, four tabs:
  1. **Schedules** — CRUD templates (name, description, status, hours grid with "common hours → apply to all").
  2. **Assign Schedule** — pick a template + a searchable **multi-select** of staff (chips + autocomplete) → assign; plus a "Current assignments" list with unassign.
  3. **Calendar** — month grid; click a day to add/edit/delete holidays & events (multiple per day).
  4. **Staff Schedule Table** — per-day, read-only table of each assigned staff's hours for the selected date (day nav + Today), holiday-aware.
- Services: `app/src/services/staffScheduleService.ts`, `app/src/services/staffCalendarService.ts`.
- Types: in `app/src/types/index.ts` — `StaffSchedule`, `StaffScheduleDay`, `StaffScheduleAssignment`,
  `CreateStaffScheduleData`, `AssignStaffScheduleData/Result`, `StaffCalendarEvent`, `CreateStaffCalendarEventData`,
  `DayOfWeek`, `CalendarEventType`.
- Route registered in `app/src/App.tsx` (`hris/staff-schedules`); sidebar item in `components/sidebar/Sidebar.tsx`.
- React Query keys: `['staff-schedules']`, `['staff-schedule-assignments']`, `['staff-calendar-events', …]`.
- Always use the shared `Select` from `components/select` (never raw `<select>`).

---

## Integrating from other modules

**Goal: "what are staff member X's working hours on date D? Are they off / on holiday?"**

1. Resolve the date's weekday key: JS `new Date().getDay()` (0=Sun) →
   `['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][idx]`.
2. Find the staff's assignment (`staff_schedule_assignments` where `user_id` = X, scoped to institution).
   No assignment → staff has no schedule.
3. Load the assigned template's `days`; find the row where `day_of_week` = the weekday key.
   No matching row → **day off**.
4. Check `staff_calendar_events` for a `holiday` on date D (institution-wide) → treat as off.

Example (PHP/Eloquent):
```php
use App\Models\StaffScheduleAssignment;
use App\Models\StaffCalendarEvent;

$weekday = strtolower($date->format('l')); // 'monday'..'sunday'

$assignment = StaffScheduleAssignment::with('staffSchedule.days')
    ->where('institution_id', $institutionId)
    ->where('user_id', $userId)
    ->first();

$day = $assignment?->staffSchedule?->days
    ->firstWhere('day_of_week', $weekday); // null = day off

$isHoliday = StaffCalendarEvent::where('institution_id', $institutionId)
    ->whereDate('event_date', $date)
    ->where('type', 'holiday')
    ->exists();

$working = $day !== null && ! $isHoliday;
// $day->start_time / end_time / lunch_start / lunch_end are TIME ("HH:MM:SS")
```

### Conventions to respect
- `day_of_week` is **lowercase full name** (`monday`). Times in the API are `HH:MM`; in the DB they are `TIME`.
- One assignment per staff — don't assume a staff can have several; `assign` upserts/replaces.
- Institution scope everything (mirror `resolveInstitutionId` in the controllers).
- Deleting a template is blocked while it has assignments (409).

---

## Not yet wired (good follow-ups)
- Holidays are informational only — they do **not** yet auto-zero expected hours in attendance/payroll.
- No multi-day holiday ranges (one `event_date` per entry).
- Schedules are not yet consumed by the Attendance / ZKTeco modules (no tardiness/expected-vs-actual calc).
- No per-staff schedule overrides (everyone on a template shares identical hours).
