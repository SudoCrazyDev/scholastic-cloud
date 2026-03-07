# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview
ScholasticCloud is a SaaS education management platform. Core services:
- **API** (`api/`): Laravel 12 / PHP 8.2, MariaDB 11 database (via Docker). Runs on port 8000.
- **Frontend** (`app/`): React 19 + Vite + TypeScript. Runs on port 5173.
- **Shared** (`shared/`): Shared TypeScript types consumed by frontend packages.
- Optional: website (`website/`, Astro), desktop app (`desktop-app/`, Tauri), payments microservice (`microservices/payments/`, Docker-only), document reader (`microservices/document-reader/`, Cloudflare Workers).

### Running services

**MariaDB** (required before API):
```bash
export DB_USERNAME=schoolmate_user DB_PASSWORD=schoolmate_password DB_DATABASE=schoolmate
cd api && sg docker -c "docker compose up -d mariadb"
```

**API server:**
```bash
cd api && export DB_USERNAME=schoolmate_user DB_PASSWORD=schoolmate_password DB_DATABASE=schoolmate && php artisan serve --host=0.0.0.0 --port=8000
```

**Frontend dev server:**
```bash
cd app && npm run dev -- --host 0.0.0.0
```

### Important gotchas

- **System env vars override `.env`**: The Cloud Agent VM injects environment variables (from secrets) that override the `api/.env` file. The injected `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE` values do not match the Docker Compose MariaDB credentials. You **must** export the correct values (`DB_USERNAME=schoolmate_user`, `DB_PASSWORD=schoolmate_password`, `DB_DATABASE=schoolmate`) in your shell before running any `php artisan` command.
 **VITE_API_URL must include `/api`**: Set `VITE_API_URL=http://localhost:8000/api` in `app/.env`. The frontend axios base URL is set directly from this value, and Laravel API routes are prefixed with `/api`.
- **Seeded user credentials**: `philiplouis0717@gmail.com` / `password` (first login prompts password change).

### Lint and test commands

- Frontend lint: `cd app && npm run lint`
- Frontend build (includes TypeScript check): `cd app && npm run build`
- API lint (Pint): `cd api && vendor/bin/pint --test`
- API tests (PHPUnit): `cd api && php artisan test`
- Shared build: `cd shared && npm run build`
