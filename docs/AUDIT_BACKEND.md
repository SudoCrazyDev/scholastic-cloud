# ScholasticCloud API (Backend) Audit Report

_Audited: 2026-04-13_
_Scope: `/api` — Laravel 12 + PHP 8.2_

## Executive Summary

The ScholasticCloud API is a Laravel 12 educational management backend with 62 HTTP controllers managing students, academics, assessments, payments, and AI-powered lesson planning. The app has solid structural foundations for multi-tenant institution management, but exhibits **security gaps (open CORS, no rate limiting, plaintext tokens), minimal test coverage, and architectural inconsistencies** (fat controllers, no Form Requests, no Policies, no API Resources) that must be addressed before production hardening.

---

## 1. Tech Stack & Dependencies

### Core
- **Laravel**: 12.0
- **PHP**: 8.2 minimum
- **Database**: MariaDB 11 (Docker) / SQLite fallback
- **API Auth**: Custom token-based (not Sanctum for API despite Sanctum being installed)

### Key Packages
- `laravel/sanctum` ^4.0 — installed but underutilized (config only)
- `laravel/framework` ^12.0
- `league/flysystem-aws-s3-v3` 3.27 — S3 + Cloudflare R2
- `fakerphp/faker` ^1.23
- Dev: `phpunit/phpunit` ^11.5.3, `laravel/pint` ^1.13, `mockery/mockery` ^1.6, `laravel/pail` ^1.2.2, `laravel/sail` ^1.41

### Third-Party Integrations
- OpenAI GPT-4.1-mini + Anthropic Claude (AI planner)
- Maya Payments (PH gateway, sandbox)
- Cloudflare R2 (object storage)
- Cloudflare Worker (document OCR)

### Missing
- **No Laravel Horizon** (queue monitoring)
- **No Laravel Telescope** (debugging)
- **No Spatie permissions** (RBAC is custom)
- **No API docs tooling** (Scribe / L5 Swagger)
- **No static analysis** (PHPStan/Larastan)

---

## 2. Project Structure

```
api/
├── app/
│   ├── Auth/                   # StudentPortalUser wrapper
│   ├── Http/
│   │   ├── Controllers/        # 62 controllers
│   │   └── Middleware/         # Only AuthenticateToken.php
│   ├── Models/                 # 54 models
│   ├── Services/               # Ai/, Payments/, grade services (7 files)
│   ├── Jobs/                   # Only GenerateLessonPlansJob
│   └── Providers/              # AppServiceProvider (empty)
├── routes/
│   ├── api.php                 # 330 lines
│   └── web.php                 # Trivial
├── database/migrations/        # 30+ migrations (latest Aug 2025)
├── config/                     # + custom ai.php, payments.php
├── tests/
│   ├── Feature/ExampleTest.php
│   └── Unit/OnlinePaymentTransactionServiceTest.php
├── Dockerfile, docker-compose.yml, docker-entrypoint.sh
└── phpunit.xml
```

### Strengths
- Clear Models / Controllers / Services separation
- Multi-tenancy aware (institution-centric filtering)
- Service layer for AI & payment

### Weaknesses
- **No Form Requests** (validation inline in controllers)
- **No API Resources** (models returned raw)
- **No Policies / Gates** (auth logic scattered)
- **No Repositories** (direct Eloquent in controllers)
- **No Events / Listeners**
- **One middleware only** (`AuthenticateToken`)
- **7 service files for 62 controllers** (business logic in controllers)
- **Only 1 queued job** (most work is synchronous)

---

## 3. API Design

### REST Conventions
- 62 resource controllers follow REST naming ✓
- Nested resources used (e.g., `/students/{id}/documents`) ✓
- Pagination via `per_page` on list endpoints ✓

### Issues
- ❌ **No versioning** — no `/api/v1/` prefix
- ❌ **Inconsistent response shapes** — mix of `{ success, data, pagination }`, `{ success, data }`, raw arrays
- ❌ **Inline validation** — `$request->validate()` everywhere (e.g., `StudentPaymentController::store:98`)
- ❌ **No API resources** — API tightly coupled to DB schema
- ❌ **No error envelope** — some `{ message }`, some `{ errors }`
- ⚠️ Search filters ad-hoc and inconsistent across endpoints

### Notable Endpoints
| Route | Auth | Notes |
|-------|------|-------|
| `POST /login` | No | Custom tokens |
| `GET /profile` | Yes | Dual User / StudentAuth |
| `POST /kiosk/scan` | **Public** | RFID gate — unprotected |
| `POST /public/admission-form-submissions` | **Public** | Unprotected |
| `POST /assume-user` | Yes | Impersonation — needs guards |
| `POST /ai/subjects/{id}/quarters/{q}/topics/generate` | Yes | Queued |

---

## 4. Authentication & Authorization

### Authentication
- Custom token system (not Sanctum tokens)
- `User::token` + `User::token_expiry` (opaque 60-char strings)
- `AuthenticateToken` middleware checks both `User` and `StudentAuth` tables
- **Hardcoded 24-hour expiry** (`AuthController::login:29`)
- **No refresh tokens** — clients re-login after 24h

### Authorization
- Scattered `isStudentUser()` helper checks across controllers
- Manual institution filter per query: `whereHas('studentInstitutions', ...)`
- **No Policies, no Gates, no permission model**
- All authenticated users = full access to their institution

### Gaps
- ⚠️ **Tokens stored in plaintext in DB** (should hash)
- ⚠️ **No refresh mechanism**
- ⚠️ **No revocation on password change**
- ⚠️ **`assume-user` without visible guards**
- ⚠️ **CORS wildcard** — `allowed_origins: ['*']`, `allowed_methods: ['*']`, `allowed_headers: ['*']`
- ⚠️ **No rate limit on `/login`** (brute-force risk)

---

## 5. Database

### Schema Highlights
- UUIDs via `HasUuids` ✓
- Timestamps on most tables ✓
- Foreign keys enabled (`DB_FOREIGN_KEYS=true`) ✓
- Soft deletes on `ClassSection`

### Models (54)
Major tables: `users`, `students`, `student_auth`, `student_institutions`, `class_sections`, `subjects`, `student_subjects`, `subject_ecr`, `subject_ecr_items`, `student_ecr_item_scores`, `student_running_grades`, `student_payments`, `student_online_payment_transactions`, `student_rfid_tags`, `rfid_scan_logs`, `lesson_plans`, `topics`, `subject_quarter_plans`, `ai_generation_tasks`.

### Issues

**Mass Assignment**
- All models use `$fillable` ✓
- Some overly permissive (e.g., `Student::$fillable` includes all columns)

**N+1 Risks**
- `StudentController::index:174` — `$student->fresh()->load('studentInstitutions')`
- Desktop sync endpoints load collections without explicit `with()`
- `StudentPaymentController::index:60` iteration patterns

**Indexing**
- No explicit `.index()` calls in migrations
- Missing composite indexes:
  - `(student_id, institution_id)` on `student_institutions`
  - `(student_id, subject_id)` on `student_ecr_item_scores`
  - `(student_id, section_id)` on `student_sections`
  - `(institution_id, academic_year)` on `student_institutions`

**Relationships**
- ⚠️ `ClassSection::adviserUser()` uses `belongsTo(User::class, 'adviser')` where `adviser` is a UUID **string** column (not a true FK). Works by convention but fragile.

**Soft Deletes**
- Used in `ClassSection` but not consistently across related models

---

## 6. Security

### SQL Injection
- No raw query execution ✓
- Eloquent ORM with bound parameters ✓

### Mass Assignment
- `$fillable` on all models ✓
- Some controllers skip request-level validation before `->update($request->all())`

### CORS / CSRF
- ⚠️ **CORS wide open** (`config/cors.php`)
- ⚠️ No CSRF on API routes (expected for stateless, but verify web routes)

### Token Security
- ⚠️ **Plaintext tokens in DB** — should SHA-256 hash
- ⚠️ Tokens generated with `Str::random(60)` (secure) — but DB exposure is critical
- ⚠️ **Expired tokens not purged** from DB
- ⚠️ **No revocation endpoint**

### Environment
- ✅ `.env.example` provided
- ⚠️ `.env` present in repo path (verify `.gitignore`)
- ⚠️ **`.env.production` present** — should never be committed (contains `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
- ⚠️ `LOG_LEVEL=debug` in `.env.example` (verbose in prod)

### File Uploads
- ✅ Stored on S3/R2, not local `public/`
- ⚠️ `StudentController::updateWithFile:157` — no MIME validation
- ⚠️ Document upload — no file type restrictions

### Logging
- ⚠️ `Log::info()` in payment callback logs full request URL/payload (may include PII / payment data)

### Rate Limiting
- ❌ **No rate limiting on any route** (no `throttle` middleware in routes)
- ❌ `/login`, `/kiosk/scan`, `/public/admission-form-submissions` all unthrottled

---

## 7. Queues / Jobs / Scheduling

### Queue Config
- Driver: `database` (default; Redis available)
- `retry_after = 90s`
- Failed jobs table with UUID tracking

### Jobs
- **Single job**: `GenerateLessonPlansJob` (256 lines)
  - 600s timeout, 1 retry
  - Tracks progress via `AiGenerationTask`
  - Validates AI output; falls back to template
  - Transactional (DB rollback on error)

### Gaps
- ❌ **Only 1 job**; payments, emails, reports all sync
- ❌ **No scheduled tasks** — no `Console/Kernel.php` schedule entries
- ❌ **No Horizon** for queue monitoring
- ⚠️ **No queue worker container** in `docker-compose.yml`
- ⚠️ **No failed-job cleanup migration**

---

## 8. Performance

### Caching
- Cache store: `database` (Redis supported)
- ⚠️ **No explicit caching** in controllers/models
  - Academic years, subjects, grade levels, etc. — all queried per request

### Eager Loading
- N+1 risks in desktop sync, student list, payment list endpoints
- `fresh()->load()` pattern indicates late loading

### Query Optimization
- Missing indexes (see Section 5)
- Unpaginated heavy endpoints: `/proficiency/by-section`, `/section-consolidated-grades`

### Response Size
- No API resources — returns all DB columns
- Clients get unnecessary data

---

## 9. Testing

- PHPUnit 11.5.3; phpunit.xml configured for Feature + Unit suites
- In-memory SQLite for tests ✓
- **Actual coverage:**
  - `tests/Feature/ExampleTest.php` — trivial
  - `tests/Unit/OnlinePaymentTransactionServiceTest.php` — payment service (1 file)
- **No tests for:** authentication, authorization, API CRUD, models, AI, grade calculation
- **No database factories or seeders audited** for test data

---

## 10. Configuration & Environment

### `.env.example`
- ✅ Covers: app, logging, DB, mail, cache, session, AWS/R2, AI providers, Maya, Cloudflare Worker
- ⚠️ Missing: `MAIL_FROM_NAME`, priority queue vars, Redis cluster config, structured-log format

### Config Files
- ✅ Standard Laravel configs present
- ✅ Custom `config/ai.php` and `config/payments.php`
- ⚠️ No `config/api.php` (versioning, pagination defaults, error shape)

### Config Caching
- ⚠️ No `config:cache` step in Dockerfile/CI
- ✅ Test suite clears config for isolation

---

## 11. DevOps

### Dockerfile
- ✅ Multi-stage build, PHP 8.2-FPM base
- ✅ Required extensions: PDO MySQL, mbstring, bcmath, gd, pcntl, exif
- ✅ Upload limits set (10M file, 256M memory)
- ✅ Proper permissions for www-data
- ⚠️ **CMD uses `php artisan serve`** — this is a dev server, not production-suitable
- ⚠️ No `config:cache` / `route:cache` / `view:cache` in build

### docker-compose.yml
- ✅ MariaDB 11 with healthcheck, named volume
- ⚠️ `MARIADB_ROOT_PASSWORD=root_password` hardcoded
- ⚠️ Ports 8000 and 3306 exposed (OK dev, risky prod)
- ❌ **No Redis or queue-worker service**

### Deployment Story
- ⚠️ `docker-entrypoint.sh` designed for dev (volume mount assumption)
- ❌ **No CI/CD pipeline**
- ❌ **No load balancing / horizontal scaling story**

---

## 12. Documentation

- ⚠️ **Boilerplate Laravel README** — no project-specific content
- ❌ No API endpoint docs (no OpenAPI/Scribe/Postman)
- ❌ No architecture overview (multi-tenancy, AI, payment flow)
- ❌ No setup/seeding guide
- ❌ No contributing guidelines
- ⚠️ Sparse PHPDoc; controllers have little documentation

---

## 13. Code Quality

### Style
- ✅ Pint installed
- ⚠️ No `.pint.json`, no pre-commit hook
- ⚠️ Inconsistent response format, control-flow style

### Static Analysis
- ❌ No PHPStan/Larastan
- ⚠️ Sparse return-type hints

### Architecture Smells
- **Fat controllers** — e.g., `StudentController::updateWithFile:157-200` handles R2 upload + validation + DB inline
- **Scattered authorization** — `isStudentUser()` across controllers
- **Duplicate institution-resolution code** in every controller
- **Underused service layer** — 7 services for 62 controllers
- **No repositories, no events/listeners**
- **Payment confirm is synchronous** — risk of timeout if gateway is slow
- **No form requests** — validation inline everywhere

---

## What Needs To Be Done

### HIGH PRIORITY

1. **Implement Form Request classes** — extract `$request->validate()` into `app/Http/Requests/*` (LoginRequest, StoreStudentRequest, etc.)
2. **Fix CORS configuration** — [config/cors.php](../api/config/cors.php): replace `['*']` with `explode(',', env('CORS_ALLOWED_ORIGINS'))`
3. **Implement rate limiting** — `throttle:5,1` on `/login`; default `throttle:60,1` on public endpoints; add to [routes/api.php](../api/routes/api.php)
4. **Token refresh mechanism** — `AuthController::refresh()`; silent refresh before 24h expiry
5. **Hash tokens in DB** — add `token_hash` column; hash on issue, compare on validate; migration + `AuthenticateToken` update
6. **Add Laravel Policies** — `StudentPolicy`, `InstitutionPolicy`, etc.; replace `isStudentUser()` with `$this->authorize()`
7. **Create comprehensive test suite** — Authentication, Student API, Payment API, grade calc; target >70% on critical paths
8. **Fix N+1 queries** — explicit `->with()` on list endpoints; enable Laravel Debugbar in dev
9. **Remove `.env.production` from repo** — add to `.gitignore`; move to CI/CD secrets
10. **Configure queue worker** — add `queue-worker` service to docker-compose; install Horizon for monitoring

### MEDIUM PRIORITY

11. **API Resources** — `app/Http/Resources/*` for stable JSON schemas
12. **Standardize API responses** — `ApiResponse::success()` / `error()` helper
13. **API versioning** — `/api/v1/` prefix
14. **Institution-context middleware** — resolve institution once per request, inject via DI
15. **Events & queued listeners** — `PaymentConfirmed`, `StudentEnrolled` + email listeners
16. **Add DB indexes** — composite indexes on high-traffic filter columns
17. **Caching strategy** — `Cache::remember()` on reference data (grade levels, subjects); invalidate on writes
18. **Consistent soft deletes** — audit models that should have `deleted_at`
19. **Structured logging** — JSON logs with request_id, user, institution, duration; sanitize sensitive fields
20. **Documentation** — README rewrite, ARCHITECTURE.md, API.md (or Scribe-generated)

### LOW PRIORITY

21. Repository pattern (optional; Eloquent is sufficient)
22. Request/response logging middleware
23. Laravel Telescope (dev-only)
24. OpenAPI/Scribe integration
25. Per-institution usage quotas/throttling

---

## Summary Table

| Category | Status | Key Issues |
|----------|--------|-----------|
| Tech Stack | Modern | Missing Horizon, Telescope, API docs tools |
| Structure | OK | No Form Requests/Resources/Policies |
| API Design | Adequate | No versioning, inconsistent responses |
| Auth | Custom | No refresh, plaintext tokens, no revocation |
| Database | Solid | N+1 risks, missing indexes |
| Security | **Weak** | Open CORS, no rate limiting, plaintext tokens, secrets in repo |
| Queues | Minimal | 1 job, no scheduler, no monitoring |
| Performance | Risky | N+1s, no caching |
| Testing | **Minimal** | Effectively zero |
| Configuration | OK | `.env.production` in repo |
| DevOps | Developing | No prod Dockerfile, no CI/CD, no queue worker |
| Documentation | **Missing** | Boilerplate README only |
| Code Quality | Inconsistent | Fat controllers, no static analysis |

### Estimated Effort
- **HIGH priority only:** ~6 weeks (1 senior dev)
- **HIGH + MEDIUM:** ~10 weeks

---

## Key File References

- [api/routes/api.php](../api/routes/api.php) — 330-line route file (no versioning, no throttling)
- [api/config/cors.php](../api/config/cors.php) — wildcard CORS
- [api/app/Http/Middleware/AuthenticateToken.php](../api/app/Http/Middleware/AuthenticateToken.php) — custom token auth
- [api/app/Http/Controllers/AuthController.php](../api/app/Http/Controllers/AuthController.php) — hardcoded 24h expiry
- [api/app/Http/Controllers/StudentController.php](../api/app/Http/Controllers/StudentController.php) — fat controller, inline validation, N+1
- [api/app/Jobs/GenerateLessonPlansJob.php](../api/app/Jobs/GenerateLessonPlansJob.php) — only queued job
- [api/Dockerfile](../api/Dockerfile) — uses `artisan serve` (dev)
- [api/docker-compose.yml](../api/docker-compose.yml) — no queue worker, hardcoded DB password
- [api/phpunit.xml](../api/phpunit.xml) — test config (minimal tests)

---

## Conclusion

The backend is a functional Laravel 12 application with solid fundamentals but requires substantial hardening before production deployment. **Critical security gaps** (wildcard CORS, no rate limiting, plaintext tokens in DB, `.env.production` in repo) must be remediated immediately. **Architectural debt** (fat controllers, no Form Requests, no Policies, scattered authorization) should be addressed in parallel with **test-suite build-up** to enable safe refactoring.

**Sequenced plan:**
1. **Week 1:** Security fixes — CORS, rate limiting, token hashing, remove `.env.production`, Policies scaffold
2. **Weeks 2–3:** Form Requests + API Resources + standardized responses + test harness
3. **Weeks 4–6:** N+1 fixes, DB indexes, caching, queue worker + async listeners
4. **Weeks 7–10:** API versioning, documentation, CI/CD, production Dockerfile, Horizon
