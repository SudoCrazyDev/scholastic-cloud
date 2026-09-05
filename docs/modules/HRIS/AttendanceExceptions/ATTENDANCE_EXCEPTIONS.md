# Module: Attendance Exceptions (HRIS)

> How a day gets paid differently from what the biometric logs literally say.
> Read this before touching pay arithmetic in `PayrollService`, the staff calendar,
> or the attendance-request queue.

Two surfaces:

- **HRIS → Attendance Requests** (`/hris/attendance-requests`) — per-staff requests and their approval.
- **HRIS → Staff Schedules → Calendar tab** — institution-wide holidays, **suspensions** and their pay policy.

---

## The problem

Payroll reads punches and pays what they imply. That is wrong in four ordinary situations:

| Situation | What the logs say | What should be paid |
|---|---|---|
| Mayor declares a half-day after a typhoon | Everyone leaves at noon → hours-short, undertime penalty | Full daily rate |
| Staff approved to leave early for an emergency | Undertime penalty | Full daily rate |
| Staff attends an off-site event in the morning, reports at 1 PM | Huge late penalty, or half pay | Full daily rate |
| Staff out on official business all day | No punch at all → ₱0 | Full daily rate |

All four are the same shape, so there is **one** mechanism with three knobs.

## The three knobs

Every payslip day carries a snapshot of these:

| Knob | Column on `payslip_days` | Effect |
|---|---|---|
| Waive late | `waive_late` | Late minutes forced to 0, so no late penalty |
| Waive undertime | `waive_undertime` | Undertime minutes forced to 0 |
| Pay policy | `pay_policy` | `normal` \| `full_day` (daily rate regardless of hours) \| `no_pay` |

Plus one that needs no column of its own: a **shortened day** is written into the existing
`payslip_days.schedule_end` snapshot, so undertime is measured against dismissal.

`exception_label` records where the exception came from, and prints on the record.

### Why `full_day` does not bypass penalties

On the penalty path the day already **starts** at the full daily rate and subtracts only
penalties the exception did not waive. So `pay_full_day` is deliberately ignored there
(`PayrollService::priceDay`) — otherwise an approved early-out would also forgive an
unrelated late arrival. `full_day` only rescues the hours-prorated fallback path: no
schedule, missing punch, holiday, rest day.

---

## Source 1 — institution-wide (the staff calendar)

`staff_calendar_events` gained two columns (migration `2026_07_26_000001`):

| column | values | meaning |
|---|---|---|
| `pay_treatment` | `normal` \| `full_day_paid` \| `no_pay` | blanket pay policy for the date |
| `dismissal_time` | time, nullable | shortens the working day |

`type` also gained `suspension` alongside `holiday` and `event`.

**These two are independent, and that is the important part:**

- **Half-day, staff still report** → set `dismissal_time = 12:00`, leave `pay_treatment = normal`.
  Payroll snapshots `schedule_end = 12:00`. Someone who arrived on time and stayed until noon
  has zero undertime and therefore earns the **full daily rate through the ordinary rules** —
  while someone who slipped out at 09:00 is still docked. This is the recommended way to model
  an LGU half-day.
- **Nobody reports, everyone paid** → `pay_treatment = full_day_paid`. Also waives both penalties,
  since a stray punch on a suspended day must not be penalised.
- **Unpaid suspension** → `pay_treatment = no_pay`.

A `type = event` row is informational: the API forces its pay fields back to neutral so a staff
meeting cannot silently shorten everyone's paid day (`StaffCalendarEventController::validatePayload`).

### Rest-day guard

An institution-wide policy **never** turns a rest day into a paid day. Without this, a paid
holiday landing on a Sunday would hand every staff member an extra day's pay. The entry still
appears in `exception_label` for the printed record; only its pay effect is dropped. An
individually approved request is still honoured on a rest day, because a human reviewed it.

---

## Source 2 — per-staff (approved requests)

`staff_attendance_requests` (migration `2026_07_26_000002`). Staff file; a principal /
institution-administrator approves. **Only `approved` rows reach payroll** — a pending request
changes nothing.

`kind` → default knobs, from `StaffAttendanceRequest::defaultFlagsForKind()`:

| kind | waive late | waive undertime | full day | for |
|---|---|---|---|---|
| `late_arrival` | ✓ | — | ✓ | Off-site event in the morning; still expected to stay to the end |
| `early_out` | — | ✓ | ✓ | Emergency departure; arriving late still counts |
| `official_business` | ✓ | ✓ | ✓ | Away on school business, punches may be missing entirely |
| `forgot_punch` | ✓ | ✓ | ✓ | Present all day, biometric missed it |

The flags are **derived server-side from `kind`, never taken from the requester's payload**, so a
staff member cannot grant themselves a pay floor by hand-crafting a request. An approver may
override them when filing on someone's behalf or at approval time.

`credited_time_in` / `credited_time_out` optionally stand in for a missing punch. They **only fill
a side that has no punch** — a real biometric punch is never overwritten.

Requests may span up to 31 days (`assertRangeIsSane`); a duplicate pending request of the same kind
covering the same dates is rejected.

---

## Precedence

`PayrollService::mergeException()` collapses both sources per (staff, date):

1. Waivers are **unioned** — anything granted by either source stays granted.
2. An individually approved `pay_full_day` **beats** a blanket `no_pay` (specific over general).
3. On a rest day, the calendar's pay effect is dropped (see the guard above).
4. Multiple calendar entries on one date: earliest dismissal wins, `full_day_paid` outranks `no_pay`.
5. Multiple approved requests on one date: waivers unioned, first non-null credited time wins.

---

## An unpaid day is not a working day

A day that resolved to `no_pay` earns nothing, so `PayrollService::recomputeTotals()` and
`basicPay()` both drop it:

- **`payslips.days_worked`** — printed as *Total Working Days* on the slip and *Working Days* on
  the payroll sheet. A `no_pay` day is excluded **even when it has punches**: staff often report
  on a suspended day anyway, and the hours are recorded, but the day is still not one the payslip
  pays for.
- **`payslips.basic_pay`** — the scheduled-days basis percentage and bracket deductions are
  charged against. Rest days were already out; `no_pay` days join them, so a contribution is not
  billed against a day the school did not buy.

Note what is *not* excluded: an ordinary **absence** still counts toward `basic_pay` (that is the
whole point of "5% of the gross, no lates"). The exclusion is written against the **pay policy**,
not against zero earnings, precisely to keep those two apart.

Regression suite: `tests/Feature/UnpaidSuspensionWorkingDaysTest.php`.

---

## Regeneration is required

Approving a request does **not** retroactively edit an existing payslip. Payroll periods are
rebuilt from source on generate (`generateForPeriod` deletes and recreates payslips), so an
approval only lands when the period is regenerated. Both the approve response and the review
modal say so, and the response names the overlapping period and whether it is finalized.

This is also why the knobs are **snapshotted onto `payslip_days`** rather than re-read from the
source tables: `recomputeDay()` and `applyRates()` re-price purely from the day's own snapshot
after a manual time edit or a rate change. If the waivers were not stored there, editing a time
would silently reinstate a penalty an admin had already excused.

---

## File map

**Backend (`api/`)**
- Migrations: `2026_07_26_000001_add_pay_policy_to_staff_calendar_events.php`,
  `2026_07_26_000002_create_staff_attendance_requests_table.php`,
  `2026_07_26_000003_add_exceptions_to_payslip_days.php`.
- Models: `StaffAttendanceRequest.php` (statuses, kinds, `defaultFlagsForKind`),
  `StaffCalendarEvent.php` (`PAY_*` consts, `affectsPay()`), `PayslipDay.php` (`PAY_*` consts).
- `Services/PayrollService.php` — `buildDayPolicies()`, `buildStaffExceptions()`,
  `mergeException()`, `effectiveScheduleEnd()`, and the exception params on `priceDay()`.
- Controllers: `StaffAttendanceRequestController.php` (index/store/approve/disapprove/cancel),
  `StaffCalendarEventController.php` (pay fields), `PayslipController.php` (serializes the snapshot).
- Routes: `routes/api.php` — `staff-attendance-requests` + `/{id}/approve|disapprove|cancel`.

**Frontend (`app/`)**
- Page: `src/pages/HRIS/AttendanceRequests.tsx` — "For Review" (approvers) and "My Requests" tabs.
- `src/pages/HRIS/StaffSchedules.tsx` — calendar day modal now carries the suspension type,
  dismissal time and pay treatment.
- `src/pages/HRIS/Payroll/PayslipDetail.tsx` — per-day exception badges.
- Service: `src/services/staffAttendanceRequestService.ts`.
- Types: `src/types/index.ts` — `AttendanceRequestKind`, `AttendanceRequestStatus`,
  `StaffAttendanceRequest`, `CalendarPayTreatment`, `PayslipDayPayPolicy`.
- Route `hris/attendance-requests` in `src/App.tsx`; sidebar item in `src/components/sidebar/Sidebar.tsx`.

## Permissions

- **File a request**: any authenticated non-student staff member, for themselves.
- **Approve / disapprove / see the whole institution**: `principal`, `institution-administrator`,
  `super-administrator`. Their own filings are created already approved.
- **Cancel**: the requester or the subject, while still pending.

## Not yet wired

- No notification when a request is approved or disapproved — the staff member has to open the page.
- No attachment upload (medical certificate, travel order).
- Approving does not auto-regenerate the affected payroll period; it only tells you to.
- A payslip day cannot be excused directly from `PayslipDetail` — file (and auto-approve) a request
  instead, so the exception survives the next regeneration.
