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

## API routes

### Internal routes (main API -> payments service)

These routes require `X-Internal-Token` when `PAYMENTS_INTERNAL_TOKEN` is configured.

- `POST /api/v1/charges` – create Maya Checkout transaction
- `GET /api/v1/charges/{id}` – get Maya payment status

### Public webhook routes (Maya -> payments service)

- `POST /api/v1/webhooks/maya` – Maya webhook endpoint
- `POST /api/v1/webhooks/stripe` – alias to Maya webhook handler (backward compatibility)

## Environment variables

Set in `.env`:

- `PAYMENTS_INTERNAL_TOKEN` – shared token for main API internal calls
- `PAYMENTS_CALLBACK_URL` – main API callback endpoint (e.g. `/api/internal/payment-callbacks/maya`)
- `PAYMENTS_CALLBACK_TOKEN` – shared callback token header
- `MAYA_BASE_URL` – `https://pg-sandbox.paymaya.com` (sandbox) or production host
- `MAYA_PUBLIC_KEY` – Maya public API key
- `MAYA_SECRET_KEY` – Maya secret API key
- `MAYA_WEBHOOK_SIGNATURE_KEY` – webhook signature key (optional but recommended)
- `MAYA_TIMEOUT` – timeout in seconds for Maya API calls

## Flow

1. App → main API (api folder) for all requests.
2. Main API → Payment Service (this) for checkout creation and status polling.
3. Maya webhooks → Payment Service webhook endpoint.
4. Payment Service → Main API callback endpoint to reconcile status and post ledger payment.

## Edit code

Edits in `microservices/payments` are reflected in the container via the volume mount. Rebuild only when you change `composer.json` or the Dockerfile:

```bash
docker compose up -d --build
```
