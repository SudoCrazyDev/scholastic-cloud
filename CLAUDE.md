# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ScholasticCloud is a multi-tenant SaaS school-management platform for Philippine K-12 institutions
(students, grading, finance/cashiering, HRIS/payroll, attendance, SMS, chat, AI assistant).

The root `README.md` covers setup from scratch (including the Docker/MariaDB path). This file
covers the cross-cutting design and the things that are easy to get wrong. Local development on
this machine uses XAMPP/MySQL — see below.

## Repository layout

| Path | What it is |
|---|---|
| `api/` | **Laravel 12 / PHP 8.2**, MySQL/MariaDB. The whole backend. Port 8000. |
| `app/` | **React 19 + Vite + TypeScript** SPA. The whole staff/student UI. Port 5173. |
| `website/` | Astro 5 marketing site, deployed separately. |
| `microservices/chat-realtime/` | Cloudflare Worker + D1 (per-tenant DB) backing the chat module. |
| `microservices/document-reader/` | Cloudflare Worker. |
| `sms_gateway/` | TypeScript agent that runs on an on-prem kiosk with a USB GSM modem. |
| `kiosk/` | Shell scripts that boot a Raspberry Pi into a Chromium gate kiosk. |
| `ai_agents/zara/`, `docs/`, `shared/` | Misc. **`shared/` is dead** — nothing imports `@scholasticcloud/shared`. |

## Commands

Local dev (Windows/XAMPP): MySQL is already running on 3306, DB `scholastic_cloud_new_dev`,
user `root` / `administrator`.

```bash
# API — health check at GET http://localhost:8000/api/health
cd api && php artisan serve --port=8000

# Frontend — VITE_API_URL in app/.env must end in /api
cd app && npm run dev

# Queue worker (required for AI lesson-plan generation; see api/QUEUE_WORKER.md)
cd api && php artisan queue:work --tries=1 --timeout=600
```

Tests and checks:

```bash
# API tests — the DB overrides are REQUIRED. phpunit.xml defaults to sqlite :memory:,
# which blows up on the raw-SQL migrations in this repo.
cd api && DB_CONNECTION=mysql DB_DATABASE=scholastic_cloud_test php artisan test
cd api && DB_CONNECTION=mysql DB_DATABASE=scholastic_cloud_test php artisan test --filter=ReceiptApprovalQueueTest

cd api && vendor/bin/pint --test     # PHP formatting
cd app && npm run lint               # ESLint
cd app && npm run build              # tsc -b + vite build — also what the pre-commit hook runs
```

`.husky/pre-commit` runs `cd app && npm run build` and aborts the commit on failure, so a
TypeScript error anywhere in `app/` blocks every commit, including API-only ones.

The `.claude/skills/verify` skill has demo logins (all password `password`), seeded fixture IDs,
and hard-won Playwright MCP workarounds — read it before driving the app in a browser.

## Architecture

### Two independent access gates

These answer different questions and must not be conflated:

- **Modules** (`config/modules.php`, `App\Support\Modules`) — *may this person open this screen?*
  Decided by the school, in its own role builder. Permission strings are `"<module>.<ability>"`,
  base abilities `view` / `manage` plus per-module `special` abilities. Enforced by the `module:`
  middleware (`EnsureModuleAccess`) on API routes and mirrored by `RequireModule` /
  `usePermissions` in the SPA. `*` is the super-administrator wildcard.
- **Features** (`config/features.php`, `App\Support\Features`) — *does this school have the thing
  at all?* Decided by the platform on the Feature Access screen; invisible to the school and
  closed even to its own administrator. Enforced by the `feature:` middleware and `RequireFeature`.

`EnsureModuleAccess` has two behaviours worth knowing before you declare a route: a route declared
`view` still demands `manage` for any unsafe HTTP verb, so a resource group can be marked `view`
once; and a third `shared` argument (`module:students,view,shared`) lets a signed-in student
through to endpoints about their own records — but a student is only allowed writes where the
declaration says `manage,shared`.

Modules listed under `modules.personal` (`dashboard`, `my-finance`, `my-chats`, …) are a person's
own records and are never permission-gated. Tala (the AI assistant) is the one module granted to
individual teachers via a `tala_access` row rather than by a role — see
`App\Models\Concerns\HasModulePermissions::applyTalaAccess`.

### Authentication

Custom, not Sanctum (the package is a dependency but unused). `AuthenticateToken` (`auth.token`)
reads a bearer token and resolves it against **two** identity tables:

- `users` — staff/admin. Permissions come from the role attached to their active institution
  (default institution → main institution → legacy `users.role_id`).
- `student_auths` — the student portal. Wrapped in `App\Auth\StudentPortalUser`, which holds no
  module permissions at all.

Anything that calls `$request->user()` may get either type. There are four further device-token
middlewares for unattended hardware, each with its own pairing-code flow and public `/pair`
endpoint: `auth.bridge.token` (ZKTeco HRIS bridge), `auth.sms.token`, `auth.gate.token`,
`auth.chat.worker`. ZKTeco ADMS devices post to `/iclock/*`, registered in `bootstrap/app.php`
outside the `/api` prefix with no auth at all.

### Multi-tenancy and scoping

Every record belongs to an institution, and scoping is done **per-controller**, not by a global
scope — a controller resolves the user's default institution and filters on `institution_id` (or
on a pivot such as `student_institutions` / `user_institutions`). There is no trait doing this for
you; forgetting it is a cross-tenant leak. `tests/Feature/SecurityAuthorizationTest.php` is the
regression suite for exactly this class of bug and uses a two-school fixture.

Academic-year scoping is the second axis. Grade items, running grades and report cards are all
filtered by academic year, and a record saved without one silently disappears from every query
(and can zero out a calculated grade). Resolve it via `App\Support\AcademicYear` — never derive it
inline. School years run June–May.

Models use **UUID primary keys** (`HasUuids`, ~120 of 126 models).

### Uploads

All uploaded files live in a private Cloudflare R2 bucket and are served through permanent signed
`/api/media` links built by `App\Support\MediaUrl::for()`. Never use `temporaryUrl()` — presigned
URLs expire and turn embedded assessment images and lesson attachments into broken links. Read
`docs/modules/Media/MEDIA.md` before adding an upload or changing `APP_URL` / `APP_KEY`.

### Frontend conventions

The layering is consistent across ~60 modules and new code should follow it:

`pages/<Module>/` → `hooks/use<Thing>.ts` (TanStack Query, `useX` for reads plus `useXMutations`
for writes with toast side-effects) → `services/<thing>Service.ts` (a class of typed methods,
exported as a singleton) → `lib/api.ts` (the single axios instance).

- `lib/api.ts` attaches the bearer token and redirects to `/login` on 401 — **except** on the
  kiosk paths (`/gate-enter`, `/gate-exit`), which must never navigate away; a wall-mounted gate
  showing a login form does not recover on its own.
- Shared UI primitives are Headless UI-based and live flat in `app/src/components/`. **Always use
  `Select` from `components/select`, never a raw `<select>`.**
- The shared `Button` renders `<button>` with no `type`, so it defaults to `submit` — pass
  `type="button"` for anything inside a `<form>` that only triggers a handler.
- All shared types are in one 3.5k-line `app/src/types/index.ts`.

## Gotchas

- **The API runs in UTC.** `config/app.php` hardcodes `'timezone' => 'UTC'` and ignores
  `APP_TIMEZONE`, while the schools are in Asia/Manila. Never `whereDate` a school day.
- `simulate.date` middleware honours `?as_of=YYYY-MM-DD` on a couple of finance routes so a
  payment plan can be read as it will stand months later. Local/testing only; it is attached
  per-route (after auth) deliberately — see the comment in `bootstrap/app.php`.
- `api/README.md` is the stock Laravel readme; ignore it. The root `README.md` is the real one.

## Docs

`docs/modules/README.md` is an annotated index of per-module design docs (Finance, Announcements,
Tala, HRIS staff schedules & attendance exceptions, Media, SMS Gateway, Gate Kiosk). **Read the
relevant one before working on or integrating with a module** — each covers the data model, API,
frontend, live consumers of its data, and what is not yet wired. New module docs follow the
conventions at the bottom of that index (File map + Integration sections).

`docs/SECURITY_AUDIT.md` and `.github/VIP-DEPLOYMENTS.md` (per-client GitHub Environments) are the
other two worth knowing about.

## Deployment

Pushing to `master` deploys automatically via path-filtered workflows: `api/**`, `app/**`,
`website/**`, and `microservices/chat-realtime/**` each have their own. The API and app deploy to
production *and* to every VIP/self-hosting client in the workflow matrix, each drawing credentials
from its own GitHub Environment.

## Commit messages

This repo uses plain prose sentences describing the user-visible change — no conventional-commit
prefixes, no scopes. E.g. *"Share a general payment across the fees that still owe"*,
*"Let a family change their own payment plan, and name who changed it"*.
