# Online Payments

**Built.** A student or a cashier starts a payment, the payer is redirected to a provider, and the
provider tells us it went through — at which point the payment posts to the student's ledger like
any other collection.

The thing this module is actually about is **whose merchant account the money lands in**. It is
never the platform's. Each school holds its own contract with its own provider and its own bank
account, so credentials are stored **per institution**, encrypted, and a driver is constructed with
one school's keys at a time. Only **PayMaya (Maya)** has a driver today; the layer around it exists
because the second and third schools will not be on Maya.

---

## File map

### Backend

| File | What it is |
|---|---|
| `api/config/payments.php` | The provider catalog. Label, driver class, hosts per mode, products, and **the credential fields each provider needs**. No school's keys are here. |
| `api/app/Support/PaymentProviders.php` | Reads the catalog. Everything else asks this — validation, the driver factory, the admin screen. |
| `api/app/Models/InstitutionPaymentGateway.php` | One school's merchant account. `credentials` is an `encrypted:array`; `readinessProblems()` says why it cannot take money. |
| `api/app/Services/Payments/Contracts/PaymentGatewayDriver.php` | What a provider must be able to do: open a checkout, read one back, verify a callback, parse a callback, name itself on a receipt. |
| `api/app/Services/Payments/Drivers/MayaDriver.php` | Maya. Both products (`payby`, `checkout`), signature verification, and Maya's several status vocabularies collapsed into ours. |
| `api/app/Services/Payments/PaymentGatewayManager.php` | Which account a school pays through, and a driver holding its keys. Singleton per request. |
| `api/app/Services/Payments/GatewayStatus.php` | The only status words the platform speaks: `pending`, `authorized`, `completed`, `failed`, `expired`, `cancelled`. |
| `api/app/Services/Payments/Data/*.php` | `CheckoutRequest`, `CheckoutSession`, `GatewayEvent` — provider-neutral shapes. |
| `api/app/Services/Payments/OnlinePaymentTransactionService.php` | The one place a gateway status becomes a `StudentPayment`. Provider-blind. |
| `api/app/Http/Controllers/StudentOnlinePaymentController.php` | Start a checkout, list, read back, record a browser-reported outcome. |
| `api/app/Http/Controllers/PaymentWebhookController.php` | Where providers call. Public, unauthenticated, signature-gated. |
| `api/app/Http/Controllers/InstitutionPaymentGatewayController.php` | The platform screen's API. Keys are write-only. |

### Tables

| Table | Notes |
|---|---|
| `institution_payment_gateways` | `(institution_id, provider)` unique. `credentials` ciphertext, `credential_hints` last-4 for display, `webhook_slug` random and unique, `is_active`. |
| `student_online_payment_transactions` | Now carries `institution_payment_gateway_id` — **which account took it**, so a late callback is verified with the keys the payment was started under, not whichever the school is on now. |

### Routes

| Route | Gate |
|---|---|
| `GET /api/student-online-payments/availability` | `module:finance,view,shared` — can this school take a payment at all |
| `POST /api/student-online-payments/checkout` | `module:finance,manage,shared` |
| `GET /api/student-online-payments/{id}` | `module:finance,view,shared` — also reconciles anything still open |
| `POST /api/payments/webhooks/{provider}/{slug}` | **public**, signature-verified |
| `POST /api/payments/webhooks/maya` | **public**, legacy fixed URL, signature-verified |
| `GET|PUT|DELETE /api/institution-payment-gateways/...` | `module:payment-gateways` — **`system_only`** |

### Frontend

| File | What it is |
|---|---|
| `app/src/pages/PaymentGateways/PaymentGateways.tsx` | The platform screen. Form fields render from the catalog. |
| `app/src/services/paymentGatewayService.ts` | Its service and types. |
| `app/src/services/studentOnlinePaymentService.ts` | The student/cashier side. |
| `app/src/pages/Students/components/StudentFinanceTab.tsx` | Where a payment is started today. |

---

## Who may set the keys

The **platform**, and nobody else. `payment-gateways` is `system_only` in `config/modules.php`, so
a school cannot be granted it in its own role builder — `RoleController::permissionRule()` holds an
institution admin to `Modules::assignablePermissions()`, and a crafted payload asking for it is
rejected rather than quietly granted.

This is a policy choice, not a technical one, and it cuts against the fact that the school owns the
merchant account. It is made because whoever onboards the account with the provider is the platform;
because a school administrator cannot tell a sandbox key from a live one by looking at it; and
because a mistyped live secret key is an outage in the middle of enrolment.

Keys are **write-only through the API**. They are never selected into a response — the screen sees
`{ set: true, masked: "••••blic" }` and the webhook URL, and nothing else. A blank input means
"leave what is stored", so a mode can be changed without re-typing three secrets.

---

## The webhook, and why the URL carries a slug

A callback arrives with no session. To trust it you need the right school's signing key, and to get
that you need to know which school it is — before you have trusted anything it says.

So the URL names the account: `/api/payments/webhooks/maya/<webhook_slug>`. The slug is random and
unique rather than the institution UUID, because this URL sits in a third party's dashboard and
logs, and a tenant identifier there is an enumeration handle given away for nothing.

Three rules hold in `PaymentWebhookController`:

1. **Nothing is written before the signature verifies.** Reading the body to work out which key to
   check is fine; acting on it is not.
2. **No signing key means no trust.** A gateway without one cannot be switched on, and its callbacks
   are refused.
3. **A verified callback for one school cannot move another school's transaction.** Checked
   explicitly, because a school holding valid keys would otherwise be able to complete any reference
   it could guess.

An unmatched callback is answered **202**, not 404 — providers retry, and retrying will not help.

### The legacy URL

`POST /api/payments/webhooks/maya` still works and is still verified. It has no slug, so it finds
the transaction by the `STUPAY-…` reference we minted ourselves and takes the gateway from there.
Keep it until every live Maya dashboard has been repointed.

---

## Two bugs this replaced

Worth knowing about, because both were silent:

- **Unsigned callbacks were trusted.** The old verifier returned `true` when no signature key was
  configured. Anyone who could guess a reference number could POST a `PAYMENT_SUCCESS` and mint a
  real `StudentPayment` against a real student.
- **Signed callbacks could never verify.** The header was split on its first `=` and the right-hand
  side kept — but a base64 SHA-256 is 44 characters ending in `=` padding, so that destroyed every
  well-formed bare signature. The two bugs hid each other: the only callbacks it ever accepted were
  the unsigned ones.

`MayaDriver::signatureCandidates()` now tries the bare value and the `t=…,v1=…` list form.
`tests/Unit/MayaTranslationTest.php` covers both.

---

## Adding a provider

1. Add an entry to `config/payments.php` — label, driver class, `modes` (host per mode), `products`
   if it has any, `credentials` (the fields it needs).
2. Write the driver implementing `PaymentGatewayDriver`. It is constructed with the school's
   `InstitutionPaymentGateway` and must read its keys from there — **never from `config()`**. That
   is exactly what made the previous implementation impossible to run for two schools.
3. Translate that provider's status vocabulary into `GatewayStatus` inside the driver. Nothing
   downstream may ever see the provider's own word for a status.

No migration, no new screen, no frontend change: the admin form renders from the catalog.

---

## Integration

**Consumers of this module's data**

- `student_payments` — a completed transaction posts one, with `payment_method` from the driver
  (`"Online - Pay With Maya"` / `"Online - Maya Checkout"`) and the provider's payment id as the
  reference number. Everything downstream of a payment — ledger, statement of account, collection
  report, receipt — reads it as an ordinary collection and knows nothing about gateways.
- `PaymentIdentifierRegistry` sees these reference numbers like any other.

**What this module depends on**

- `Institution` for scoping, `StudentPayment::generateUniqueReceiptNumber()` for the receipt number,
  `App\Support\AcademicYear` conventions via the caller's `academic_year`.

**Idempotency.** `OnlinePaymentTransactionService::applyGatewayUpdate()` re-reads the transaction
under `lockForUpdate()` and posts only when `completed_payment_id` is null. Providers retry, and a
payer refreshing the return page while a webhook lands means two requests at once. `completed` is
absorbing — a late "expired" cannot unpost a payment — but `cancelled → completed` is deliberately
allowed, because the browser writes `cancelled` when a payer is redirected through the cancel URL
and a payer who cancels, goes back and pays must not lose the money.

---

## Not yet wired

- **Only Maya has a driver.** Xendit and Stripe are the expected next two; neither is in the catalog
  yet, so nothing about them is guessed at here.
- **No refunds.** The driver contract has no `refund()`. A refund today is a void on the receipt plus
  a refund in the provider's own dashboard, reconciled by hand.
- **No convenience fee.** If the platform ever takes a cut, prefer a plain line item added to the
  payer's total over provider-specific split-payment features (Stripe Connect application fees,
  Xendit split rules) — those would fragment the driver contract badly.
- **No scheduled reconciliation.** Anything still `pending` is only read back when someone opens
  `GET /student-online-payments/{id}`. A payment whose webhook never arrived and whose payer never
  returns stays pending indefinitely. A sweep is the obvious next job.
- **One live account per school.** Switching one on stands the others down. A school offering two
  providers at once and letting the payer choose is not supported and would need a real choice in
  the checkout flow, not just a second active row.
