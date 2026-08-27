# ScholasticCloud

A multi-tenant SaaS school-management platform for Philippine K-12 institutions: student records,
grading and report cards, finance and cashiering, HRIS and payroll, attendance (biometric and RFID
gate), SMS, chat, and an AI teaching assistant.

## Repository layout

```
ScholasticCloud/
├── api/                          # Laravel 12 backend (the whole API)
├── app/                          # React 19 + Vite SPA (staff + student portal)
├── website/                      # Astro marketing site
├── microservices/
│   ├── chat-realtime/            # Cloudflare Worker + D1 — realtime chat delivery
│   └── document-reader/          # Cloudflare Worker — document OCR / text extraction
├── sms_gateway/                  # On-prem agent for a USB GSM modem kiosk
├── kiosk/                        # Raspberry Pi gate-kiosk boot scripts
├── ai_agents/zara/               # Experimental agent
├── docs/                         # Per-module design docs — see docs/modules/README.md
└── CLAUDE.md                     # Architecture notes for AI coding agents
```

`shared/` is a leftover TypeScript types package that nothing imports.
The root `docker-compose.yml` is an unrelated n8n stack, not part of the application.

## Tech stack

| | |
|---|---|
| **API** | Laravel 12, PHP 8.2, MySQL / MariaDB 11, UUID primary keys, custom bearer-token auth |
| **Frontend** | React 19, Vite 7, TypeScript 5.8, TanStack Query, Tailwind CSS 4, Headless UI, React Router 7 |
| **Storage** | Cloudflare R2 (private bucket, signed permanent URLs) |
| **Edge** | Cloudflare Workers + D1 for chat and document reading |
| **Website** | Astro 5 |

## Prerequisites

- PHP 8.2+ and Composer
- Node.js 18+ (CI builds on 24)
- MySQL 8 or MariaDB 11 — locally via XAMPP, or via Docker (see below)

## Setup

### 1. Database

Either point at a local MySQL/MariaDB instance, or use the bundled Docker service:

```bash
cd api && docker compose up -d mariadb
# database: schoolmate, user: schoolmate_user, password: schoolmate_password
```

### 2. API

```bash
cd api
composer install
cp .env.example .env
php artisan key:generate
# set DB_DATABASE / DB_USERNAME / DB_PASSWORD in .env to match your database
php artisan migrate --seed
php artisan serve --port=8000
```

Verify with `GET http://localhost:8000/api/health`.

### 3. Frontend

```bash
cd app
npm install
cp .env.example .env
# VITE_API_URL must include the /api suffix — the axios base URL is used verbatim
npm run dev
```

The app runs at http://localhost:5173.

### 4. Queue worker (optional)

Required only for AI lesson-plan generation, which runs as a background job:

```bash
cd api && php artisan queue:work --tries=1 --timeout=600
```

See [api/QUEUE_WORKER.md](api/QUEUE_WORKER.md).

## Environment variables

`api/.env.example` and `app/.env.example` are the source of truth. The ones that matter beyond the
database connection:

| Variable | Purpose |
|---|---|
| `APP_URL` | Must be the public API origin — uploaded-file URLs are minted against it. Changing it requires `php artisan media:repair-urls`. |
| `R2_*` | Cloudflare R2 bucket for every upload. Without it, file uploads fail. |
| `AI_PROVIDER`, `OPENAI_*`, `ANTHROPIC_*` | AI assistant (Tala) and the lesson planner. |
| `MAYA_*` | Maya online-payment checkout. |
| `CHAT_*` | Realtime chat Worker. Leave blank and chat falls back to polling. |
| `DOCUMENT_READER_URL` | Document OCR Worker. |
| `VITE_API_URL` | Frontend → API base URL, **including `/api`**. |

## Commands

```bash
# Tests — the DB overrides are required; phpunit.xml defaults to sqlite :memory:,
# which cannot run this repo's raw-SQL migrations.
cd api && DB_CONNECTION=mysql DB_DATABASE=scholastic_cloud_test php artisan test
cd api && DB_CONNECTION=mysql DB_DATABASE=scholastic_cloud_test php artisan test --filter=SomeTest

cd api && vendor/bin/pint          # PHP formatting (--test to check only)
cd app && npm run lint             # ESLint
cd app && npm run build            # tsc -b + vite build
cd website && npm run dev          # Astro dev server
```

A husky pre-commit hook runs `cd app && npm run build`, so a TypeScript error anywhere in `app/`
blocks every commit — including API-only ones.

## Architecture notes

Two things are worth knowing before reading the code:

- **Access is gated twice.** `api/config/modules.php` holds the role permissions a school hands out
  in its own role builder; `api/config/features.php` holds the switches the *platform* controls,
  which are closed even to a school's administrator. A request must pass both.
- **Tenant scoping is per-controller.** There is no global scope — each controller resolves the
  user's institution and filters on it. `api/tests/Feature/SecurityAuthorizationTest.php` is the
  regression suite for cross-tenant leaks.

[CLAUDE.md](CLAUDE.md) covers this and the rest of the cross-cutting design in detail.
[docs/modules/README.md](docs/modules/README.md) indexes the per-module docs — read the relevant
one before working on or integrating with a module.

## Deployment

Pushing to `master` deploys automatically through path-filtered GitHub Actions workflows
(`api/**`, `app/**`, `website/**`, `microservices/chat-realtime/**`). The API and app deploy to
production *and* to every VIP / self-hosting client in the workflow matrix, each drawing its
credentials from its own GitHub Environment — see
[.github/VIP-DEPLOYMENTS.md](.github/VIP-DEPLOYMENTS.md).
