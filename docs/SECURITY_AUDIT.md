# Backend Security Audit — ScholasticCloud API

**Date:** 2026-08-01
**Scope:** `api/` (Laravel 11 — 96 controllers, 626 routes in `routes/api.php`, plus `routes/iclock.php`)
**Method:** Static review of code and config. The local API was not running during the audit, so findings
are evidenced by code and configuration, **not** by live exploitation. Items marked _unverified_ need a
runtime check.

**Status legend:** `[ ]` open · `[~]` in progress · `[x]` fixed & verified · `[-]` accepted risk / won't fix

---

> ### ⚠️ Correction — 2026-08-01
>
> The first pass of this audit read a **stale working tree**: a 538-line `routes/api.php` with no
> route-level authorization, and a `bootstrap/app.php` with only three middleware aliases. The real
> tree has a **626-line `routes/api.php` with 259 `module:<module>,<ability>` gates** and an
> [`EnsureModuleAccess`](../api/app/Http/Middleware/EnsureModuleAccess.php) middleware.
>
> **The original claim that "there is no authorization layer" was wrong.** There is one, it is
> well-built, and it covers most of the API. Several findings were downgraded accordingly — they are
> real but require a privileged role rather than "any logged-in user". Severities below are corrected;
> the original inflated ratings are noted inline so the change is auditable.
>
> Anything reported as fixed below was verified against the **current** tree and is covered by tests.

---

## Context: how authorization actually works

Three layers, and they matter for reading anything below:

1. **`auth.token`** — authenticates only. Accepts staff tokens *and* student portal tokens.
2. **`module:<module>,<ability>`** ([`EnsureModuleAccess`](../api/app/Http/Middleware/EnsureModuleAccess.php)) —
   the real gate, applied per route. Automatically upgrades `view` → `manage` for unsafe HTTP verbs.
   A third `shared` argument passes student portal users straight through to the controller.
3. **Controller-level checks** — where *tenant* scoping lives. The middleware answers "may this role
   reach this module", never "does this row belong to this caller's school". That gap is where the
   confirmed cross-tenant findings sit.

`config/modules.php` is the catalog; `Role::permissionList()` and `User::hasModuleAccess()` enforce it.
Use [`AuthorizesModuleAccess`](../api/app/Http/Controllers/Concerns/AuthorizesModuleAccess.php) for
controller-side checks.

---

## Critical

### [x] C1 — Session tokens serialized into API responses
**Fixed 2026-08-01.** *Originally rated "any authenticated user, including students" — wrong: `/users`
is gated `module:users,view` and `/staffs` is `module:staffs,view`. Corrected impact below.*

`users.token` is a real column, but `$hidden` on the User model listed only `password` and
`remember_token`, and `UserController::index` / `StaffController::index` return raw serialized models.

**Actual impact (still critical):** any holder of `users.view` or `staffs.view` — registrar, HR,
institution admin — received every listed user's **live bearer token**. That is a direct privilege
escalation to super-administrator. `UserController` had no institution scoping either, so it also
crossed tenants.

- [x] `token`, `token_expiry` added to `User::$hidden` and `StudentAuth::$hidden`
- [x] `UserController::index`/`show` scoped to the caller's institutions (super-admin unscoped)
- [x] `UserController` writes gated on `users.manage`; `StaffController` writes on `staffs.manage`
- [x] Regression tests: serialized user/student carry no credentials; staff directory leaks no token
- [ ] **Rotate all existing user tokens in production** — assume every token issued before this fix is compromised

### [x] C2 — Student portal credentials were not tenant-scoped
**Fixed 2026-08-01.** *Originally rated "any authenticated user including a student" — wrong: the
routes are gated `module:students,manage` / `students,view`. Corrected to a cross-tenant break.*

`StudentAuthController` had no institution check, so staff holding `students.manage` at one school
could overwrite the portal credentials of a student at **any other school** and sign in as them.

- [x] Staff-only + `students.manage` (write) / `students.view` (read) enforced in-controller
- [x] Target student must share an institution with the caller; super-admins unscoped
- [x] Credential reset now clears the student's existing `token` (session no longer outlives the reset)
- [x] Regression tests for both the refusal and the still-working same-school path

### [x] C3 — Write access through the `shared` student-portal bypass
**Fixed 2026-08-01.** Confirmed reachable by a signed-in student before the fix.

In `EnsureModuleAccess`, the `shared` branch returned `$next($request)` for a `StudentPortalUser`
**before** the `view` → `manage` upgrade for unsafe verbs.

**This was wider than first recorded.** It was not one endpoint: **nine** `view,shared` apiResources
carry `store`/`update`/`destroy`, and the bypass opened all of them to students — `students`,
`subjects`, `student-subjects`, `subjects-ecr-items`, `student-sections`, `student-ecr-item-scores`,
`student-running-grades`, `student-attendances` and `announcements`. A student could write their own
grades, attendance and item scores, and post announcements.

`StudentRunningGradeController` also had no authorization of its own, so its `index` returned **every
grade in the database** when called with no filter — cross-student and cross-tenant.

The fix keys on the declared ability rather than blanket-passing students: a `view,shared` route
exempts them for safe methods only, while routes that genuinely take a student write declare
`manage,shared` (document upload, checkout, payment receipt submission) and still pass.

- [x] `shared` bypass now respects the verb — one change closes the write path on all nine resources
- [x] `StudentRunningGradeController` scopes student reads to their own grades (`index` and `show`)
- [x] Student writes refused in-controller too, on all six write methods (defence in depth)
- [x] Every `,shared` route reviewed; the four legitimate student writes are `manage,shared` and unaffected
- [x] Regression tests, including that a `manage,shared` student write still succeeds and staff writes still work
- [ ] **Follow-up:** the other eight resources now reject student *writes*, but their *reads* are still
      unscoped at controller level — a student may be able to read other students' rows via
      `student-ecr-item-scores`, `student-attendances`, `student-sections`. Same shape as the
      `StudentRunningGradeController` read bug, not yet audited per-controller.

### [ ] C4 — Payment webhook fails open
**Open — unaffected by routing; still valid as first reported.**

[InternalPaymentCallbackController.php:122-125](../api/app/Http/Controllers/InternalPaymentCallbackController.php#L122-L125):
if the signature key is empty, `verifyWebhookSignature()` returns `true` unconditionally.
`MAYA_WEBHOOK_SIGNATURE_KEY` is in `.env.example` but **absent from the dev `.env`**, so verification
is entirely disabled there.

- [ ] **Check the production `.env` first** (_unverified_ — only the dev `.env` was inspected)
- [ ] Invert the fail-open: a missing key must reject, ideally refuse to boot
- [ ] Review `student_online_payment_transactions` for suspicious completions

---

## High

### [x] H1 — No rate limiting anywhere
**Fixed 2026-08-01.**

`throttle` appeared nowhere; Laravel 11 applies none unless `throttleApi()` is called. `/api/login`
accepted unlimited attempts.

- [x] `$middleware->throttleApi()` in `bootstrap/app.php`
- [x] Limiters defined in `AppServiceProvider`: `api` (300/min), `login` (5/min per email+IP, 20/min per IP), `pairing` (10/min per IP)
- [x] `throttle:login` on `/login`; `throttle:pairing` on `/bridge/pair`, `/sms-gateway/pair`, `/kiosk/scan`
- [x] Student `is_active` now checked at login
- [x] Regression tests for throttling and deactivated-student login

> **Correction:** the original report said login "never checks `is_active`, so deactivated staff can
> still authenticate." Half wrong — the **`users` table has no `is_active` column at all**, so staff
> deactivation does not exist as a concept; the only way to revoke staff access today is to delete the
> record. Adding the check naively would have rejected *every* staff login; a regression test caught
> that before it shipped. The students table does have the column, and that check is now in place.

- [ ] **Follow-up:** add `is_active` to `users` via migration so staff can be deactivated at all

### [x] H2 — Cross-tenant reads via client-supplied `institution_id`
**Fixed for the two confirmed endpoints 2026-08-01.** Severity unchanged — the module gate never
checked *which* institution was named, only that the caller could reach the module.

`ProficiencyController` and `SF9Controller` took `institution_id` (and, for SF9, `student_id`) straight
from the request, validated only with `exists:…`. A principal at one school could read another
school's grades and print its students' report cards.

- [x] `ProficiencyController` (both sites) uses `resolveRequestedInstitution()` — membership enforced
- [x] `SF9Controller::generate` / `getAcademicYears` verify both the institution and the student
- [x] Regression tests for the refusal and the still-working own-institution path
- [ ] **Remaining sites, not yet audited:** `InstitutionController:324`, `StudentController:705`,
      `SchoolDayController:68,114,159,321`, `RfidScanLogController:39,101,112,171,193`,
      `StudentRfidTagController:23-26`, `UserController:293`

### [x] H3 — Staff password reset used a hardcoded literal
**Fixed 2026-08-01.** *Originally rated "any staff member" — wrong: the route is gated
`module:staffs,manage`. Downgraded from privilege escalation to weak-credential handling.*

`StaffController::resetPassword` set every reset account's password to the literal `'password'`.

- [x] Random 14-character one-time password (`Str::password`), returned once to the admin
- [x] Reset clears the target's `token` so existing sessions end
- [x] Explicit in-controller `staffs.manage` check (defence in depth behind the route gate)
- [x] Frontend surfaces the temporary password — the API no longer returns a value the admin can guess
- [x] Regression test asserts the password is random, hashed, and the session cleared

---

## Medium

### [ ] M1 — Password change doesn't require the current password
[AuthController `updatePassword`](../api/app/Http/Controllers/AuthController.php) validates only the
new password. Any leaked or borrowed token converts into permanent account ownership.

- [ ] Require and verify `current_password`; invalidate other sessions on change

### [ ] M2 — Unauthenticated attendance injection (feeds payroll)
`/iclock/*` runs with `middleware([])` by design.
[`IClockController::resolveDevice`](../api/app/Http/Controllers/IClockController.php#L31-L46)
auto-registers any unknown serial number and assigns it to `Institution::orderBy('created_at')->first()`
— the oldest tenant. Those logs feed payslip generation.

- [ ] Shared secret / device allowlist, or bind `/iclock/*` to the LAN
- [ ] Stop auto-assigning unclaimed devices to the oldest institution

### [ ] M3 — Public kiosk endpoint leaks student PII
`POST /api/kiosk/scan` is unauthenticated, writes a scan log, and returns `$log->load(['student', …])`
— full student records to an anonymous caller. Also returns raw `$e->getMessage()`.
(Now rate limited by `throttle:pairing`, but still unauthenticated.)

- [ ] Authenticate kiosks with a device token, as the bridge does
- [ ] Return a minimal payload; stop returning exception messages

### [ ] M4 — Token handling
Tokens are stored in plaintext and looked up with `where('token', $token)`. Device tokens *are*
SHA-256 hashed ([`AuthenticateBridgeToken`](../api/app/Http/Middleware/AuthenticateBridgeToken.php)) —
user tokens should match. Tokens are 24h and non-rotating; `assumeUser` overwrites the target's token,
silently ending their session.

- [ ] Hash user/student tokens at rest; shorten lifetime; separate impersonation tokens

---

## Low / hardening

- [ ] **CORS** — `allowed_origins => ['*']` in [config/cors.php](../api/config/cors.php#L22). Low impact
      (bearer header, not cookies) but should be an allowlist.
- [ ] **SVG uploads** — `IdCardTemplateController:152` permits `svg`; stored XSS if served inline.
- [ ] **Attacker-controlled extension** — `StudentAssessmentController:522` sniffs MIME correctly but
      names the stored file from `getClientOriginalExtension()`, so a real PNG can be stored as `.html`.
- [ ] **Prod debug flags** — dev is `APP_DEBUG=true` / `APP_ENV=local`; confirm production differs (_unverified_).

---

## Verified clean

- **Authorization coverage** — 259 route-level `module:` gates; the design is sound. Payroll
  (`PayrollCompensationController`, `PayslipController`) and `StudentAssessmentController` are good
  reference implementations of role + tenant scoping.
- **SQL injection** — no string-interpolated raw queries; the three `whereRaw` uses are parameterized or constant.
- **Mass assignment** — no `$guarded = []`; no `create($request->all())`.
- **Secret hygiene** — `.env` gitignored and untracked.
- **Password storage** — bcrypt via `Hash::make`.
- **Upload validation** — explicit `mimes:` allowlists on most endpoints (exceptions in Low).
- **Signed media URLs** — `/api/media` is unauthenticated by necessity but protected by
  `ValidateMediaSignature`.

---

## Structural follow-up

The route-level gate already exists and is good. What is missing is the second half:

- [ ] A tenant-scoping helper applied as consistently as `module:` is — most confirmed findings are
      "the module gate passed, but nobody checked *which school's* row this is".
      [`AuthorizesModuleAccess`](../api/app/Http/Controllers/Concerns/AuthorizesModuleAccess.php) is the
      start; `resolveRequestedInstitution()` should replace every hand-rolled `institution_id` read.
- [ ] Replace raw model responses with API Resources so credential/PII leaks can't recur
- [ ] Scope student *reads* in the remaining `,shared` controllers (see C3 follow-up)
- [ ] Extend `tests/Feature/SecurityAuthorizationTest.php` as findings are closed

---

## Progress log

| Date | Item | Change | By |
|------|------|--------|-----|
| 2026-08-01 | — | Audit completed, findings recorded | Claude |
| 2026-08-01 | — | **Correction:** first pass read a stale tree; route-level `module:` gating exists. C1/C2/H3 downgraded, "no authorization layer" retracted | Claude |
| 2026-08-01 | C1 | Tokens hidden on both auth models; user/staff endpoints scoped and write-gated | Claude |
| 2026-08-01 | C2 | `StudentAuthController` staff-only, tenant-scoped, clears session on reset | Claude |
| 2026-08-01 | H1 | `throttleApi` + `api`/`login`/`pairing` limiters; student `is_active` at login | Claude |
| 2026-08-01 | H2 | Institution membership enforced in Proficiency + SF9 | Claude |
| 2026-08-01 | H3 | Random one-time reset password, session cleared, module gate | Claude |
| 2026-08-01 | — | `tests/Feature/SecurityAuthorizationTest.php` added (12 tests); full suite 214 passed | Claude |
| 2026-08-01 | C3 | `shared` bypass now verb-aware (closed writes on 9 resources); grade reads scoped to the student; 6 write methods guarded | Claude |
| 2026-08-01 | — | Suite extended to 18 security tests; full suite 220 passed | Claude |
