# Schoolmate Payment Service

Laravel API for payments. Called by the main API (api folder), not directly by the app.

## No Composer on host

The project is built entirely inside Docker. You do **not** need Composer installed locally.

## Quick start

```bash
cd microservices/payments
cp .env.example .env
docker compose up -d --build
```

- Payment API: **http://localhost:8001**
- Health: **http://localhost:8001/up**
- MariaDB: port **3307** (so it doesn’t clash with the main API’s 3306)

## Generate APP_KEY

After first run:

```bash
docker compose exec payments php artisan key:generate
```

## API routes (for main API to call)

- `POST /api/v1/charges` – create charge (TODO: Stripe/provider)
- `GET /api/v1/charges/{id}` – get charge status
- `POST /api/v1/webhooks/stripe` – Stripe webhook (TODO: verify signature)

## Flow

1. App → main API (api folder) for all requests.
2. Main API → Payment Service (this) when it needs to create a charge or handle payment logic.
3. Payment provider webhooks → Payment Service; then Payment Service can notify main API if needed.

## Edit code

Edits in `microservices/payments` are reflected in the container via the volume mount. Rebuild only when you change `composer.json` or the Dockerfile:

```bash
docker compose up -d --build
```
