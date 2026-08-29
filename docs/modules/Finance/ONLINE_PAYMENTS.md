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
| `api/app/Services/Payments/Drivers/MayaDriver.php` | Maya. Both products (`payby`, `checkout`), read-back confirmation of callbacks, and Maya's several status vocabularies collapsed into ours. |
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
| `app/src/pages/Students/components/StudentFinanceTab.tsx` | Where a payment is started. Rendered by both the staff student profile and the student's own `/my-finance`. |
| `app/src/pages/MyFinance.tsx` | The student portal page. Loads the student and hands off to the tab above. |

---

## The payer's side (`/my-finance`)

`StudentFinanceTab` is one component serving two audiences, so everything a payer may do is behind
`isStudentUser`. A cashier looking at the same student sees the ledger and none of the buttons.

**Nothing is offered until the school is asked.** On load the portal calls
`GET /student-online-payments/availability`; only a `ready: true` answer draws the Pay Online form
and the per-installment Pay buttons. This is the reason the endpoint exists — the merchant account
is per school now, so no screen may assume there is one. A school that has never been set up shows
the receipt-upload path alone, with no dead button and no mention of a provider.

The provider is **named from the answer, never hardcoded**. The screen says "Pay any part of your
balance through Maya (PayMaya)" because `provider_label` said so; against a school on Xendit the same
line would name Xendit, with no change here.

A **sandbox account warns the payer in as many words**. A test merchant takes fake cards and settles
nothing, and a payer who believes a test payment cleared stops chasing a balance that is still owed.

### The trip out and back

1. `POST /checkout` returns a redirect URL. The transaction id goes into `sessionStorage`
   (`pendingOnlinePaymentId`) *before* `window.location.href` is set — the browser leaves this origin
   entirely, so component state does not survive; session storage does, and is not shared with a
   second tab.
2. The provider sends the payer back to `?payment_result=success|failure|cancel` on the same path.
3. The marker is read once and **stripped from the address bar** with `replaceState`, guarded by a
   ref rather than by the URL so a remount cannot replay it and StrictMode's double-invoke cannot
   kill the confirmation mid-flight.
4. `failure`/`cancel` call `POST /{id}/outcome`, which only ever narrows `pending → failed/cancelled`.
   It cannot post money, so a payer lying about their own redirect gains nothing.
5. `success` **polls `GET /{id}`** at 0/2/4/6 seconds. That endpoint reads the payment back from the
   provider, so this settles the ledger on its own rather than waiting on the webhook. A provider
   hands the payer back the moment the card clears, which is often before its own callback lands —
   and Maya's callbacks can be late or absent entirely.
6. Still open after the last read, the payer is told the payment is *received and being confirmed* —
   deliberately **not** called a failure. The money may well have moved, and telling a payer it did
   not invites a second payment.

A `409` from checkout is reported as *"your school is not taking online payments at the moment"*,
not as a failed payment, and re-asks availability — the school's setup is the likeliest thing to
have changed between the page loading and the button being pressed.

Past transactions stay listed even when the school later switches online payments off: they are the
payer's own record of what they paid.

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

1. **Nothing is written until the callback is established as real.** Reading the body, and reading
   the database to find which school and which transaction it concerns, are both fine; acting on it
   is not.
2. **There are exactly two ways to establish that**, and a callback with neither is refused:
   a signature made with the school's signing key, or **the provider confirming the payment when
   asked with the school's secret key**. What must never happen is the old behaviour, where an
   unsigned callback was trusted whenever no key was configured.
3. **A verified callback for one school cannot move another school's transaction.** Checked
   explicitly, because a school holding valid keys would otherwise be able to complete any reference
   it could guess.

An unmatched callback is answered **202**, not 404 — providers retry, and retrying will not help.

### Maya does not sign its Checkout callbacks

This is the thing to know before touching webhook code. Maya Business Manager's webhook screen is
**seven URL slots and no signing key** — `paymaya-signature` is a [Biller API](https://developers.maya.ph/docs/biller-api)
facility, not a Checkout one. So `MayaDriver::verifyWebhook()` returning false is the ordinary case.

What makes a Maya callback trustworthy is `confirmWebhook()`: the payment is read back from
`GET /payments/v1/payments/{id}` with the school's **secret key**, and that answer replaces whatever
the callback claimed. In Maya Checkout the `checkoutId` doubles as the `paymentId`, so one lookup
serves both products.

This is stronger than a signature, not a concession. A forged callback costs the attacker a lookup
that returns what really happened — for an invented payment, a 404 and a 401 back to them. It also
settles what an event *means*, which matters because Maya's own status list is ambiguous: `DONE` is
"final" but sits beside `PAYMENT_FAILED`, so it means the checkout finished, **not** that it was
paid. `mapStatus()` deliberately leaves `DONE` as `pending` and lets the read-back's `paymentStatus`
decide. Reading it as success would post money for a declined card.

`webhook_signature_key` is therefore **optional** in the catalog and `secret_key` is required —
without the secret key a callback could never be confirmed, so the gateway cannot be switched on.

### Filling in Maya Business Manager

Paste the school's one webhook URL into **every** slot on that screen — Payment success, Payment
failed, Payment expired, One-time payment success/failure/dropout, Authorized. The event is in the
body, not the URL, and the read-back overrules it anyway.

### When Maya answers 401

Maya refuses a mismatched credential with a bare `401` and no indication of which half is wrong, so
the driver writes down our side of it instead: the host, the mode, the product, and which of the two
keys was sent. That sentence reaches the log always, and the `detail` field when `APP_DEBUG` is on.

A `401` on create-checkout is never transient and never Maya being down — the request arrived and
the key was refused. It is nearly always one of:

- **Mode does not match the key pair.** Sandbox keys against `pg.paymaya.com`, or live keys against
  `pg-sandbox.paymaya.com`. The Payment Gateways screen lets these be set independently, and nothing
  about a key's text says which environment issued it.
- **Live keys that are not live yet.** Maya issues them before the merchant account finishes
  activation, and they 401 until it does. Nothing on our side can tell this from a wrong key.
- **Keys issued for the other product.** Maya's Checkout and Pay With Maya key pairs are different.
  Checkout keys against `/payby/v2/paymaya/payments` — which is what `product: payby` calls — is a
  401, and so is the reverse.
- **Public and secret swapped.** Create-checkout sends the *public* key; only the read-back in
  `fetchCheckout()` sends the secret one. A gateway with the two transposed therefore fails at
  checkout and would also fail every webhook confirmation.

The payer is told to speak to the finance office rather than to try again, because every retry
against a refused key fails the same way.

### The legacy URL

`POST /api/payments/webhooks/maya` still works and is still verified. It has no slug, so it finds
the transaction by the `STUPAY-…` reference we minted ourselves and takes the gateway from there.
Keep it until every live Maya dashboard has been repointed.

---

## Two bugs this replaced

Worth knowing about, because both were silent:

- **Unsigned callbacks were trusted.** The old verifier returned `true` when no signature key was
  configured — which, given Maya issues none for Checkout, was always. Anyone who could guess a
  reference number could POST a `PAYMENT_SUCCESS` and mint a real `StudentPayment` against a real
  student.
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
  `GET /student-online-payments/{id}` — which the portal now does for a few seconds after the payer
  returns. A payment whose webhook never arrived *and* whose payer closed the tab on the provider's
  site stays pending indefinitely. A sweep is the obvious next job.
- **The payer cannot retry from the list.** A `pending` row on `/my-finance` shows its status and
  nothing else; resuming an abandoned checkout means starting a new one.
- **One live account per school.** Switching one on stands the others down. A school offering two
  providers at once and letting the payer choose is not supported and would need a real choice in
  the checkout flow, not just a second active row.
