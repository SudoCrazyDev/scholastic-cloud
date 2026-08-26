# Module: Finance

> Context doc for working on or integrating with the **Finance** module — the staff-facing money
> side of the app: fee setup, cashiering (POS), student ledgers, collections reporting, discounts,
> receipt templates, payment-void approvals, and data clearing. Use the [file map](#file-map) to jump straight to
> whatever a new feature touches, and [Adding a new Finance view](#adding-a-new-finance-view) for
> the exact steps to extend the page.

Location in nav: **Finance → Finance** (`/finance` and `/finance/*`), **Finance → Payment
Plans** (`/payment-plans`, a standalone page **outside** the Finance tab shell), and **Finance →
Announcements** (`/finance-announcements`, also standalone — a separate module, see
[Finance Announcements](Announcements/FINANCE_ANNOUNCEMENTS.md)). Sidebar `allowedRoles` for all
three: `super-administrator`, `principal`, `institution-administrator`, `finance`. Students see their own money at **My Finance** (`/my-finance`) — a separate page, not
part of this shell.

Everything is **institution-scoped**: backend controllers resolve the institution from the
authenticated user (`resolveInstitutionId`); there is **no per-route role middleware** on Finance
routes — only `auth.token` plus in-controller checks (see [Roles & permissions](#roles--permissions)).

---

## Page architecture: one component, eleven URLs

`app/src/pages/Finance/Finance.tsx` is a single ~4,000-line component that renders one of eleven
**views** based on `location.pathname` (the `view` memo near the top of the component). Every
`/finance/*` path in `src/App.tsx` renders the same `<Finance />`; the URL is the tab state, so
views are bookmarkable and there is no tab state to persist.

Navigation is **two-level** (data-driven constants at the top of `Finance.tsx`):

- `PRIMARY_NAV` — the top row: **Dashboard**, **Cashiering**, **Ledger**, **Collections**,
  **Receipt Approvals**, **Void Requests** (only when `canRequestVoid`), and **Setup**.
- `SETUP_NAV` — a sub-row that appears only while a setup view is active: **School Fees**,
  **School Fees Amounts**, **Student Fees**, **Grade Level Discounts**, **Default Discounts**,
  **Sibling Discounts**, **Receipt Builder**, **Data Clearing** (only when
  `canClearFinanceData`, via the `requiresClearData` flag on the nav entry).
  The "Setup" primary item links to `/finance/school-fees` and is highlighted whenever `view` is
  in `SETUP_VIEWS`.
- `VIEW_SUBTITLES` — per-view one-liner shown under the page `h1`.

| View (`FinanceView`) | URL | What it is |
|---|---|---|
| `dashboard` | `/finance` | Students per grade level: total payable + remaining balance each |
| `cashiering` | `/finance/cashiering` | POS: take a multi-line payment, print receipt |
| `ledger` | `/finance/ledger` | Per-student account: charges, payments, discounts, NOA |
| `collections` | `/finance/collections` | Monthly/quarterly collections by payment method |
| `receipt-approvals` | `/finance/receipt-approvals` | Student-uploaded payment receipt review queue |
| `void-requests` | `/finance/void-requests` | Payment void request queue (role-gated) |
| `school-fees` | `/finance/school-fees` | Setup: fee type catalog |
| `default-amounts` | `/finance/default-amounts` | Setup: "School Fees Amounts" — fee amount per grade level per year |
| `student-fees` | `/finance/student-fees` | Setup: reusable student fee templates for the ledger |
| `discounts` | `/finance/discounts` | Setup: bulk discounts for a whole grade level |
| `default-discounts` | `/finance/default-discounts` | Setup: reusable discount templates |
| `receipt-builder` | `/finance/receipt-builder` | Setup: drag-and-drop receipt layout |
| `data-clearing` | `/finance/data-clearing` | Setup: permanently delete a year's finance records (ability-gated) |

Each view's queries carry `enabled: view === '<name>'` so switching tabs never fires the other
views' requests.

---

## Core concepts

- **School fee** (`school_fees`) — a named fee type (e.g. Tuition, Books), unique per
  `(institution, name)`. **Default amount** (`school_fee_defaults`) — the peso amount of a fee for
  a `(grade_level, academic_year)`, unique per `(school_fee, grade_level, academic_year)`. A
  student's **collectibles** for a year = defaults for their grade + their **additional fees**.
- **Academic year** is a plain string `"2025-2026"` everywhere (frontend builds it from the
  current calendar year; the school year runs June–March).
- **Payment transaction** (`payment_transactions`) — the receipt-level header (unique
  `receipt_number`, `total_amount`, `amount_tendered`, `change_due`). Its line items are
  **`student_payments` rows** linked by `student_payments.payment_transaction_id` — there is *no*
  separate transaction-items table. A line settles **either** a school fee (`school_fee_id`) or an
  additional fee (`student_additional_fee_id`) — never both; with neither set it is a
  "General / Other" payment.
- **Receipt identifiers — `or_number` and `reference_number`** — both **optional**, both **unique
  per institution**. A school reconciles an entered number against its physical OR booklet or the
  bank statement, so two collections carrying the same one make both unreconcilable; the second is
  refused with a 422 naming the receipt that already holds it (`errors.or_number`, so the cashier's
  own field lights up). The two are separate namespaces — an OR number does not collide with a
  reference number. Enforced in two places, deliberately:
  - `payment_transactions` carries the DB unique indexes `(institution_id, or_number)` and
    `(institution_id, reference_number)`. Blanks are normalized to **NULL**, so any number of
    receipts may leave a number unissued (MySQL treats each NULL in a unique index as distinct)
    while two empty strings would have collided.
  - `student_payments` is **not** indexed, and must not be: a line item denormalizes its header's
    number, so a four-fee receipt legitimately repeats the same OR number four times. Standalone
    payments there (no `payment_transaction_id` — the legacy single-fee path) are held unique by
    `PaymentIdentifierRegistry` instead, which is also what every write goes through.
  A **voided** payment keeps its number reserved: the physical receipt was spoiled, not returned to
  the booklet. Comparison is whatever the MySQL collation says, i.e. case-insensitive; values are
  trimmed before storing, so `"OR-1042 "` is the same number as `"OR-1042"`.
- **Discounts — three different things**:
  1. **Student discounts** (`student_discounts`) — applied to one student for a year, fixed or
     percentage, optionally tied to one fee or **split across fees** via `allocations`. Created
     from the Ledger view. Voidable directly (note required, no approval queue) via
     `POST /student-discounts/{id}/void`.
  2. **Grade-level discounts** (`grade_level_discounts`) — bulk discount for every student in a
     grade level for a year. Managed in Setup → Grade Level Discounts (`DiscountsView.tsx`).
  3. **Default discounts** (`default_discounts`) — named, reusable **templates** (e.g. "Sibling
     10%"). Managed in Setup → Default Discounts; the Ledger discount form can prefill from one.
- **Additional fees** (`student_additional_fees`) — per-student charges outside the grade-level
  defaults. `source` distinguishes them: `manual` (ad-hoc, added from the Ledger view) and
  `late_fee` (auto-charged, see below). They appear in the ledger/NOA fee breakdown flagged
  `is_additional`, each as its own collectible line, and are settled in cashiering through
  `student_payments.student_additional_fee_id`. **Soft-deleted** — removing one keeps the row.
- **Billing basis** (`billing_type` on both `student_fees` and `student_additional_fees`) — how an
  ad-hoc fee is collected. `cash` (**the default**) is owed in full on its own: it stays out of the
  principal the payment plan divides, and money paid against it never fills an installment.
  `installment` joins that principal, so every installment grows. The basis lives on the reusable
  template (what to suggest) *and* on the posted charge (what was actually used) — re-pointing a
  template never moves a charge already on a ledger. Charges posted before this existed were
  backfilled to `installment`, preserving their schedules. The ledger/NOA report it per fee in
  `fee_breakdown[].billing_type` plus a `cash_basis` summary (`charges`/`paid`/`outstanding`/
  `fee_count`) and `totals.cash_fees`. Late fees always report as `installment`: they are not
  amortized, but the schedule shows each one on the period that incurred it.
- **Payment plans** (`payment_plans` + `payment_plan_installments`) — institution-defined
  installment schedules (label, due month/day, share %, grace days, late fee). A student's chosen
  plan lives in `student_payment_plans` (unique per student+year), with every change audited in
  `student_payment_plan_changes`. Plans are managed on the standalone `/payment-plans` page; the
  Ledger's Payment Schedule view and My Finance consume them.
- **Late fees** (`LateFeeService`) — the first time a ledger or NOA load sees an installment past
  `due_date + grace_period_days` while it still owes money, the plan's `late_fee_percentage` of the
  installment's net amount is **booked as a real charge**: a `student_additional_fees` row with
  `source: 'late_fee'`, the originating `installment_sequence`, the frozen `late_fee_percentage`,
  and the `base_amount` it was charged on. Consequences worth knowing:
  - Unique per `(institution, student, academic_year, installment_sequence)`, so repeat loads
    never double-charge. There is no cron — the charge is booked on read.
  - It **survives payment** of the installment (the old behavior recomputed it live, so it
    vanished when the installment was settled and could never be collected).
  - **Re-based on later loads.** Because the charge is booked on read, its `base_amount` is
    whatever the installment happened to be the first time someone opened the page past the
    grace window — including mid-data-entry. Anything keyed in afterwards that moves the
    installment (a backdated downpayment, a void, a discount, a new charge) would otherwise
    strand the surcharge on a figure the schedule no longer shows. `LateFeeService::rebase()`
    re-derives `base_amount`/`amount`/`description` from the current installment, bounded by
    what has been collected against the fee: it never drops **below** money already received
    (that would conjure a credit out of a receipt) and never raises one **collected in full**
    (nobody is re-billed for something they settled). The percentage itself never moves, so
    editing a plan's `late_fee_percentage` is not retroactive.
  - A fee whose `amount` no longer equals `base_amount × late_fee_percentage` was **edited by
    hand**, and re-basing leaves it alone. If an installment shrinks to zero the fee stands for
    finance to waive rather than being silently zeroed.
  - Excluded from the principal the installment schedule is divided from, and payments allocated
    to a late fee do not fill installment principal.
  - **Waiving** = deleting the row (`DELETE /student-additional-fees/{id}`). The soft-deleted row
    keeps its slot in the unique index, so a waived installment is never re-charged. A **`note` is
    required** when the row is a late fee (optional for `manual`); it is stored on `waive_note`
    alongside `deleted_by`, so every waiver records who forgave the charge and why.
  - **Un-waiving** — `POST /student-additional-fees/{id}/restore` brings a waived charge back at
    the amount originally booked and clears the audit stamp. Without it a waiver is unrecoverable
    through the app, since `LateFeeService` counts trashed rows as already handled. The ledger
    lists waived charges (greyed, struck through, with the reason) when the fee list is fetched
    with `with_waived=1`, which is where the restore action lives.
  - A restored fee comes back at the amount originally booked, then re-bases on the next load
    like any other standing fee — so if the charges moved while it was waived it catches up on
    its own. A **waived** fee is never re-based; the waiver is settled business.
  - Covered by `tests/Feature/LateFeeChargeTest.php`.
- **Plans with no late fee** — `payment_plan_installments.late_fee_percentage` defaults to `0`, and
  a plan left that way silently never surcharges anyone. `/payment-plans` now flags it: an amber
  warning while editing, and a red "No late fee" badge on any saved plan where no installment
  charges. Watch for **duplicate plan names** too — two plans can share a name while only one is
  configured, and the student-facing picker cannot tell them apart.
- **Void workflow (payments)** — voiding a posted payment goes through
  `payment_void_requests`, keyed by `receipt_number`. `finance` submits a request (note
  required); approver roles approve/disapprove with a review note. **When an approver submits a
  request themselves it is auto-approved and the payment is voided immediately** (backend
  behavior in `PaymentVoidRequestController@store`). Voided payments keep their rows —
  `student_payments` gets `voided_at/voided_by/void_note`.
- **Void workflow (discounts)** — no queue and no request: the void is immediate, a note is
  required, and the row is kept. Gated by its own role-builder ability, **`discounts.void`**
  ("Void a discount", listed under Discounts as an extra ability), which sits outside
  `discounts.manage` — applying a discount and taking one back are separate grants. Both
  endpoints (`POST /student-discounts/{id}/void`,
  `POST /grade-level-discounts/{id}/void-for-student`) run behind `module:discounts,void`.
- **Receipt submissions** (`payment_receipt_submissions`) — a student uploads a proof-of-payment
  image/PDF for an installment on My Finance (status `pending`; file stored on R2 under
  `{institution}/student/{student}/payment-receipts/`). Reviewer roles (finance + admin roles)
  view the image on **Receipt Approvals**, enter the verified amount, say which fees it settles,
  and approve — or reject with a required `review_note` the student sees on My Finance.
  Installments are computed live, so the target is `academic_year` + `installment_sequence`, not a
  foreign key. One pending submission per installment at a time.

  Approving posts a **full cashiering transaction**, not a single payment: a `payment_transactions`
  header plus one `student_payments` line per allocated fee, linked back through
  `payment_receipt_submissions.payment_transaction_id`. It used to write one unallocated
  `student_payments` row, which reduced the balance and told the school nothing — the ledger read
  "Payment" with no fee behind it and the collection could not be reconciled fee by fee.
  `student_payment_id` is kept, pointing at the **first** line item, so anything already reading it
  still resolves; `payment_transaction_id` is the link to follow for the whole receipt.
  Allocations are **optional** and whatever is left unallocated posts as one "General / Other"
  line, so approving with nothing but an amount behaves exactly as it did before. Over-allocating
  is a 422 — it would post more than the image was verified for.
- **NOA (Notice of Account)** — printable statement per student+year, rendered client-side by
  `StudentNOAPDF` (`@react-pdf/renderer`) from `GET /students/{id}/noa`.
- **Receipts** — printed via `ReceiptPrintModal`, which lays the transaction out according to the
  active **receipt template** (`receipt-templates` API) built in the Receipt Builder.

---

## File map

**Frontend (`app/`)**
- Shell + Cashiering/Ledger/School Fees/School Fees Amounts/Void Requests views:
  `src/pages/Finance/Finance.tsx` (nav constants `PRIMARY_NAV`/`SETUP_NAV`/`VIEW_SUBTITLES` at
  top; `view` memo maps pathname → view).
- Sub-view components (same folder): `DashboardStudentsView.tsx`, `CollectionsView.tsx`,
  `DiscountsView.tsx` (grade-level), `DefaultDiscountsView.tsx`, `ReceiptBuilderView.tsx`,
  `ReceiptPrintModal.tsx`, `DataClearingView.tsx`, `PaymentPlansView.tsx` (standalone page),
  `ReceiptApprovalsView.tsx` (takes `embedded` — also rendered inside Cashiering).
- Shared constants: `src/pages/Finance/paymentMethods.ts` — the mode-of-payment list used by both
  the till and the receipt queue, plus `paymentMethodOptionsFor(current)`, which appends whatever a
  record already holds so an edit form cannot silently blank a value that is not in the list.
- Shared PDF: `src/components/StudentNOAPDF.tsx`.
- Services (`src/services/`): `schoolFeeService.ts`, `schoolFeeDefaultService.ts`,
  `financeDashboardService.ts`, `studentPaymentService.ts`, `studentFinanceService.ts`,
  `studentDiscountService.ts`, `defaultDiscountService.ts`, `gradeLevelDiscountService.ts`,
  `studentAdditionalFeeService.ts`, `paymentVoidService.ts`, `paymentPlanService.ts`,
  `receiptTemplateService.ts`, `financeDataClearService.ts`, plus `studentService.ts` for student
  search.
- Types: `src/types/index.ts` (`SchoolFee`, `SchoolFeeDefault`, `PaymentTransaction`,
  `StudentLedgerEntry`, `CreateStudentDiscountData`, `DefaultDiscount`, `PaymentVoidStatus`, …).
- Routes: `src/App.tsx` — `finance` + ten `finance/*` routes all render `<Finance />`
  (`finance/data-clearing` is additionally guarded `ability="clear-data"`);
  `payment-plans` renders `<PaymentPlansView />` directly, as does `finance-announcements`
  (`FinanceAnnouncementsView.tsx`, a separate module — see
  [Finance Announcements](Announcements/FINANCE_ANNOUNCEMENTS.md)). Sidebar:
  `src/components/sidebar/Sidebar.tsx` (Finance section).

**Backend (`api/`)**
- Routes: `routes/api.php`, all inside the `auth.token` group — school-fees apiResource + finance
  dashboard/collections + school-fee-defaults (~lines 297–305), student-payments +
  payment-transactions (~306–311), student-discounts (+`/void`) (~316–321), default-discounts
  apiResource (~324), grade-level-discounts (~327–331), student-additional-fees (~334–338),
  payment-void-requests (~341–344), receipt-templates apiResource (~347),
  payment-receipt-submissions (index/store/approve/reject + `PUT …/{id}/payment-details`), and the
  student-scoped ledger/NOA/payment-plan routes (~177–182), and the four
  `finance/data-clear*` routes behind `module:finance,clear-data` (just after receipt-templates).
- Controllers (`app/Http/Controllers/`): `SchoolFeeController`, `SchoolFeeDefaultController`,
  `FinanceDashboardController` (`summary`, `collections`), `StudentPaymentController` (store =
  create transaction + lines), `PaymentTransactionController`, `StudentDiscountController`,
  `DefaultDiscountController`, `GradeLevelDiscountController`, `StudentAdditionalFeeController`,
  `PaymentVoidRequestController`, `PaymentReceiptSubmissionController` (`index`, `store`,
  `approve` = post a subdivided transaction, `reject`, `updatePaymentDetails`),
  `StudentFinanceController` (`ledger`, `noticeOfAccount`),
  `StudentPaymentPlanController`, `StudentPaymentPlanChangeController`, `PaymentPlanController`,
  `ReceiptTemplateController`, `FinanceDataClearController` (`groups`, `preview`, `store`,
  `history`).
- Payment posting internals (`app/Services/Payments/`):
  - `PaymentIdentifierRegistry.php` — normalizes `or_number` / `reference_number` (trim, blank →
    NULL) and reports per-institution collisions as Laravel-shaped field errors. Every write path
    goes through it: the till, the legacy single-payment path, receipt approval, and the
    approved-receipt details edit (which passes its own transaction id so a receipt may keep the
    number it already holds).
  - `FeeAllocationGuard.php` — the rules a set of payment lines must satisfy before posting: a line
    settles a school fee **or** an additional fee and never both, school fees belong to the
    institution, additional fees belong to *this* student and year. Shared by the till and the
    approval queue so a receipt cannot be made to settle a charge on someone else's account.
- Data clearing internals: `app/Support/FinanceDataGroups.php` (the group catalog — what is
  clearable, year-scoped vs catalog, and the `dependents()` hazard map) and
  `app/Services/Finance/FinanceDataCleaner.php` (counting, the blocker guard, the transactional
  delete, R2 cleanup). Both run on the **query builder, not Eloquent** — a soft-deleted late fee is
  invisible to a model query and would survive a clear that claimed to have taken it.
- Models (`app/Models/`): `SchoolFee`, `SchoolFeeDefault`, `StudentPayment`,
  `PaymentTransaction`, `StudentDiscount`, `DefaultDiscount`, `GradeLevelDiscount`,
  `StudentAdditionalFee`, `PaymentVoidRequest`, `PaymentPlan`, `PaymentPlanInstallment`,
  `StudentPaymentPlan`, `StudentPaymentPlanChange`, `FinanceDataClearLog`.

---

## Views in detail

### Dashboard (`/finance`)
`DashboardStudentsView` — **Students Per Grade Level**. Academic-year selector +
grade-level / section filters →
`GET /finance/dashboard/students?academic_year=&grade_level=&section_id=`
(`financeDashboardService.getStudentBalances`). Response `data` carries `students` (one row per
student enrolled that year, already ordered by grade level then surname), plus `grade_levels`
and `sections` for the filter dropdowns — both built from the whole year, so filtering on one
never hides the others. The name search filters the fetched rows client-side (every word typed
must appear in the name or LRN, in any order).

Columns: name (`LAST NAME, FIRST NAME M.`), LRN, section, then **Total Payable disassembled**
under a spanning header — **School Fees** (`school_fees_payable`), **Student Fees**
(`student_fees_payable`), **Balance Forward**, **Total** — and **Remaining Balance**. The three
parts always sum to `total_payable` exactly, because the total is assembled from them rather than
computed alongside them. How the split falls out:

- **School Fees** = the grade's fee defaults **less every discount**. Discounts are only ever
  priced against the standard fees — a `student_discounts`/`grade_level_discounts` row can name a
  `school_fee_id` but there is no column pointing at an additional fee — so the whole discount
  comes off this side. A discount larger than the fee it is against reads negative rather than
  being clamped, so the row still adds up and the data problem is visible.
- **Student Fees** = that student's own additional fees as billed (ad-hoc, cash-basis, and late
  fees, which are the same kind of row and are listed with them).
- **Balance Forward** = what earlier enrolled years left owing. Kept as its own part rather than
  folded into either fee side, since it is neither.

Each row's figures are built exactly as `StudentFinanceController::ledger()` builds its totals —
charges (grade fee defaults + the student's own additional fees), less student and grade-level
discounts, plus balance forward from earlier enrolled years — so a row and the student's ledger
agree.

**The one exception, and how the view handles it.** A late fee is not a calculation, it is a
`student_additional_fees` row, and only a ledger/NOA load books one (`LateFeeService::apply`).
The listing deliberately does not — that is a write, and this reads the whole school — so a
surcharge that has just fallen due does not exist yet and cannot be counted. Consequences worth
knowing:

- A student whose ledger nobody has opened since their installment lapsed reads slightly low
  here, and the column totals with them.
- **Opening the row is what books it.** The drilldown fetches that student's ledger, which
  charges the surcharge, so it appears in the Other Fees table — while the row that sent you
  there was fetched a moment before the charge existed.

So the drilldown takes all five of its tiles from the ledger response rather than from the row
(they can never disagree with the fee table beneath them), and when the ledger reports student
fees the row lacked, `['finance-dashboard', 'students']` is invalidated so the row, its badge and
the column totals catch up. Guarded to one refetch per student, so a discrepancy that cannot
resolve costs a single fetch rather than looping.
`test_a_late_fee_reaches_the_list_once_a_ledger_load_has_booked_it` pins the whole sequence.

Selecting a row expands it into the derivation behind those columns: five tiles (school fees
charged, student fees charged, discounts, balance forward, total paid — gross, where the columns
are net) and an
**Other Fees** table — the student's ad-hoc charges, cash-basis fees and late fees with
charge / discount / paid / outstanding, read from that student's `GET /students/{id}/ledger`
`fee_breakdown` (`is_additional` lines). Read-only.

### Cashiering (`/finance/cashiering`)
The POS. Debounced student search (min 2 chars) → select a student → their ledger
`fee_breakdown` loads (reusing `GET /students/{id}/ledger`) showing each fee's outstanding
balance. The cashier types amounts per fee line (a "Pay full" shortcut fills the outstanding
amount), plus an optional "General / Other" free-form line, payment method, OR number,
reference number, amount tendered (change computed client-side). Overpaying a line only warns
(advance payment is allowed). Submit → `POST /student-payments` with `items[]` → creates one
`PaymentTransaction` + one `StudentPayment` per line, returns the transaction, and opens
`ReceiptPrintModal` for printing. Invalidates `finance-dashboard`, `student-ledger`,
`cashier-ledger` query keys.

A reused OR or reference number comes back as a 422 keyed by field, and the message renders on the
offending `Input` (cleared as soon as it is retyped); the generic `cashierError` line is suppressed
while a field error is showing so the same sentence is not printed twice in one card.

Below the till, `<ReceiptApprovalsView embedded />` renders the receipt queue (pending / approved
only) so a cashier sees what is waiting on them without leaving the screen. Modes of payment come
from `paymentMethods.ts`, shared with that queue — a mode offered in one place and not the other
shows up later as a collections report that cannot be totalled by method.

### Ledger (`/finance/ledger`)
Same student search → `GET /students/{id}/ledger` + `GET /students/{id}/noa`. Three view modes:
- `entries` — chronological charges/payments/discounts with the running balance.
- `schedule` (**Payment Schedule**) — the installment table with cumulative due/paid/remaining,
  driven by the student's payment plan. Cash-basis fees are **excluded** from its Total Payable
  and called out in a banner instead, since they were never amortized.
- `fees` (**Fees**) — the ledger's `fee_breakdown` grouped by billing basis ("Payment Plan Fees"
  vs "Cash Basis Fees"), each row showing charged / discount / paid / outstanding + a
  paid/partial/unpaid status, with per-group subtotals and charged/discount/paid/outstanding
  stat tiles across the whole year.

From here staff can:
- **Apply a discount** — fixed/percentage, optionally prefilled from a default discount; fixed
  discounts can be **split across fees** with allocation rows that must sum exactly to the total.
  → `POST /student-discounts`.
- **Add an additional fee** — name + amount + **billing basis** → `POST /student-additional-fees`.
- **Void a discount** — note required → `POST /student-discounts/{id}/void` (direct, no queue).
  Needs the `discounts.void` ability, not `discounts.manage`.
- **Request a payment void** — note required, keyed by the entry's `receipt_number` →
  `POST /payment-void-requests` (goes to the approval queue unless requester is an approver).
- **Download the NOA PDF** (`PDFDownloadLink` + `StudentNOAPDF`).

### Collections (`/finance/collections`) — `CollectionsView.tsx`
`GET /finance/collections?academic_year=` → monthly/quarterly totals with a per-payment-method
breakdown (school year June–March). Read-only.

### Receipt Approvals (`/finance/receipt-approvals`) — `ReceiptApprovalsView.tsx`
Queue of student-uploaded payment receipts (`GET /payment-receipt-submissions?status=`), with a
pending/approved/rejected filter (pending auto-refetches every 60s). Also rendered on
**Cashiering** as `<ReceiptApprovalsView embedded />` — same component, no page card, fewer
columns, and only the pending/approved filters.

**Pending → "Review"** opens the receipt image (or a file link for PDFs), a verified-amount input,
a **Subdivide across fees** panel, and a **Payment summary** block:
- The fee rows come from the student's own `GET /students/{id}/ledger` `fee_breakdown` — the same
  source the till reads — so the reviewer allocates against real balances. "Fill from balances"
  spreads the verified amount oldest-first. A running footer shows *Allocated* and what will post
  as *General / Other*, and turns red (blocking Approve) when the split exceeds the amount.
- Payment summary is mode of payment / OR number / reference number / payment date / remarks.
- Approve → `POST /payment-receipt-submissions/{id}/approve` with
  `{amount, allocations[], payment_method?, payment_date?, or_number?, reference_number?, remarks?}`;
  Reject → `POST …/{id}/reject` with a required `review_note`.

**Approved → "Edit details"** opens the same receipt read-only, showing the Payment Summary and the
per-fee subdivision labelled *"Amounts are settled — not editable here"*. "Edit details" makes the
five payment-summary fields editable — the OR number usually only exists once the booklet is
written up — via `PUT /payment-receipt-submissions/{id}/payment-details`. **No amount is editable
there, by design**: the verified figure and its split are what the ledger has already been moved
by, and restating them would move a student's balance with no void, no note and no trail. That is
what the void request queue is for. The update writes the header **and every line item**, because
the ledger reads `or_number` / `payment_date` off the lines — a header-only edit would never show
on the account.

Approved rows in the table carry a chevron that expands the subdivision inline (per-fee amounts,
total posted, receipt number, mode, OR / ref) and an "across N fees" hint under the amount. An
approval posted before `payment_transaction_id` existed renders an amber note instead of the edit
form and returns 422 if edited.

Invalidates `student-ledger`, `cashier-ledger`, NOA, and dashboard queries afterwards. Permission
gate: `module:finance,view` to see the queue, `module:finance,manage` to approve, reject, or correct
details (see `hasFinanceAbility` in `PaymentReceiptSubmissionController` — the permission is the
authority, not a role slug list).

### Void Requests (`/finance/void-requests`)
Visible only when `canRequestVoid` (frontend) — `finance` role or an approver role. Lists
`GET /payment-void-requests?status=` with a status filter. Approvers — `finance` included — get
Approve / Disapprove (review note required for disapprove). Approving voids the underlying
payment(s); the view invalidates ledger/NOA queries afterwards.

### Setup → School Fees (`/finance/school-fees`)
CRUD on the fee catalog (`name`, `description`, `is_active`) via `/school-fees`.

### Setup → School Fees Amounts (`/finance/default-amounts`)
Fee amounts per grade level + academic year via `/school-fee-defaults`. Supports single upsert,
`apply_to_all` (every grade at once → `/school-fee-defaults/apply-all`), and bulk upsert. Filterable
by grade/year. The route keeps its `default-amounts` slug; only the label reads "School Fees Amounts".

### Setup → Student Fees (`/finance/student-fees`) — `StudentFeesView.tsx`
CRUD on reusable student fee templates via `/student-fees` (name, amount, **billing basis**,
description, active flag). The Ledger's **Additional Fees** form has an `Autocomplete` over the
active ones: picking a fee fills in name/amount/description/basis and stores `student_fee_id` on the
resulting `student_additional_fees` row, so the charge can be traced back to the template. The
cashier can override the basis on the charge, and can still type a one-off fee by hand — a hand-typed
one is cash basis.

### Setup → Grade Level Discounts (`/finance/discounts`) — `DiscountsView.tsx`
Bulk discounts applied to an entire grade level for a year (fixed/percentage, optionally tied to
one fee) via `/grade-level-discounts`. Create + delete only.

### Setup → Default Discounts (`/finance/default-discounts`) — `DefaultDiscountsView.tsx`
CRUD on reusable discount templates via `/default-discounts` (name, type, value, active flag).

### Setup → Receipt Builder (`/finance/receipt-builder`) — `ReceiptBuilderView.tsx`
Drag-and-drop (dnd-kit) template designer with a palette of ~17 element types (institution
logo/name/address, receipt number, student fields, fee/amount rows, signature line, custom text,
divider, spacer…). CRUD via `/receipt-templates`. `ReceiptPrintModal` renders the active template.

### Setup → Data Clearing (`/finance/data-clearing`) — `DataClearingView.tsx`
Permanently deletes a school's finance records. **Gated on `finance.clear-data`**, a special
ability outside `finance.manage` — running the cashier does not carry the power to erase what it
recorded. Held by `institution-administrator` and `principal` by default; **not** by `finance`.

Three things are **never** clearable and have no group at all: **payment plans**
(`payment_plans`, `payment_plan_installments`, `student_payment_plans`,
`student_payment_plan_changes`), **finance announcements**, and **disbursements**
(`disbursements`, `disbursement_types`, `disbursement_component_types`,
`disbursement_receipts`).

**Groups** are declared once in `App\Support\FinanceDataGroups` and consumed by the preview, the
delete and the UI, so the count shown can never describe a different operation from the one that
runs. Each is one of two scopes:

| Group | Scope | Tables (delete order) |
|---|---|---|
| `payments` | year | `payment_receipt_submissions`, `payment_void_requests`, `student_online_payment_transactions`, `student_payments`, `payment_transactions` |
| `additional_fees` | year | `student_additional_fees` (**including soft-deleted/waived rows**) |
| `applied_discounts` | year | `grade_level_discount_student_voids`, `student_discounts`, `grade_level_discounts` |
| `fee_amounts` | year | `school_fee_defaults` |
| `school_fee_catalog` | catalog | `school_fees` |
| `student_fee_catalog` | catalog | `student_fees` |
| `discount_templates` | catalog | `default_discounts` |
| `sibling_groups` | catalog | `sibling_group_members`, `sibling_groups` |
| `receipt_templates` | catalog | `receipt_templates` |

- **year** — filtered to the selected `academic_year`; other years are untouched.
- **catalog** — the table has no `academic_year`, so the group empties it for the whole
  institution. Badged **"All years"** in the UI and grouped under its own heading, because the
  year selector otherwise implies a limit that does not apply.

**Blockers — the important part.** Every foreign key into these tables is `CASCADE` or `SET NULL`;
**not one is `RESTRICT`**. So none of this ever *fails* — it succeeds and quietly damages rows the
operator did not select. Clearing `school_fees` while last year's payments are on file nulls their
`school_fee_id` and turns every fee-attributed receipt into a "General / Other" line, and cascades
away every other year's `school_fee_defaults`. `FinanceDataGroups::dependents()` declares those
relationships and `FinanceDataCleaner::blockers()` counts the rows that would **survive** the run
while pointing at something it deleted; a non-empty result **refuses the whole operation** (422)
rather than corrupting them. The fix is to tick the referencing groups too, or leave the catalog
group unticked — the message says which.

**Flow**: pick year + groups → `POST /finance/data-clear/preview` returns per-table counts plus
blockers → confirm dialog lists the totals and requires the **academic year typed back** →
`POST /finance/data-clear`. The confirmation is re-checked server-side, and so are the blockers
(the preview may be minutes old, and a payment posted since is exactly what a guard protects).

**Audit**: every completed clear writes a `finance_data_clear_logs` row in the same transaction as
the deletes — per-table counts, group keys, and the operator's id/name/role **snapshotted**. Once
the rows are gone this is the only record they existed, so it is never cleared by any group and is
surfaced as a "Clearing history" table on the page. A `Log::warning` is also emitted.

**Uploaded receipt files** (`payment_receipt_submissions.file_path` on R2) are collected before the
delete and removed **after the transaction commits** — an object-store delete cannot be rolled
back. Failures are counted onto the log (`files_failed`, shown as an "orphaned file(s)" badge)
rather than failing an already-committed clear.

Covered by `tests/Feature/FinanceDataClearTest.php` (year isolation, payment-plan/disbursement
survival, waived late fees, both blocker directions, confirmation, `finance.manage` refusal, audit
entry, cross-institution isolation).

### Payment Plans (`/payment-plans`) — `PaymentPlansView.tsx`, **outside the shell**
Manages installment plans: per-plan installment rows (label, due month/day, share %, grace days,
late fee) via `/payment-plans`. Only month+day are persisted; the backend resolves the year from
the academic year. Routed as a sibling of `/finance` in `App.tsx` with its own sidebar item.

---

## API surface (service → endpoint quick reference)

| Frontend service | Endpoints |
|---|---|
| `schoolFeeService` | CRUD `/school-fees` |
| `schoolFeeDefaultService` | CRUD `/school-fee-defaults`, POST `…/bulk-upsert`, POST `…/apply-all` |
| `financeDashboardService` | GET `/finance/dashboard/students`, GET `/finance/collections`, GET `/finance/collections/report` |
| `studentPaymentService` | GET/POST `/student-payments`, GET `/student-payments/{id}[/receipt]`, GET `/payment-transactions/{id}[/receipt]` |
| `studentFinanceService` | GET `/students/{id}/ledger`, GET `/students/{id}/noa`, GET/POST `/students/{id}/payment-plan` |
| `studentDiscountService` | GET/POST/DELETE `/student-discounts`, POST `/student-discounts/{id}/void` |
| `defaultDiscountService` | CRUD `/default-discounts` |
| `gradeLevelDiscountService` | CRUD `/grade-level-discounts` |
| `studentAdditionalFeeService` | CRUD `/student-additional-fees` |
| `paymentVoidService` | GET/POST `/payment-void-requests`, POST `…/{id}/approve`, POST `…/{id}/disapprove` |
| `paymentReceiptService` | GET/POST `/payment-receipt-submissions` (POST is student multipart upload), POST `…/{id}/approve`, POST `…/{id}/reject`, PUT `…/{id}/payment-details` |
| `paymentPlanService` | CRUD `/payment-plans`, GET `/payment-plan-changes` |
| `receiptTemplateService` | CRUD `/receipt-templates` |
| `financeDataClearService` | GET `/finance/data-clear/groups`, GET `/finance/data-clear/history`, POST `/finance/data-clear/preview`, POST `/finance/data-clear` (all behind `module:finance,clear-data`) |

All requests go through `src/lib/api.ts` (base `VITE_API_URL`, token auth).

---

## Data model (tables at a glance)

| Table | Purpose / key columns |
|---|---|
| `school_fees` | Fee catalog. unique(institution_id, name), `is_active` |
| `school_fee_defaults` | Amount per fee+grade+year. unique(school_fee_id, grade_level, academic_year) |
| `payment_transactions` | Receipt header: `receipt_number` (unique), `total_amount`, `amount_tendered`, `change_due`, `or_number`-era fields |
| `student_payments` | Payment **lines**: nullable `school_fee_id` **or** `student_additional_fee_id` (mutually exclusive), `payment_transaction_id`, `receipt_number` (shared across lines), void columns (`voided_at/voided_by/void_note`) |
| `student_discounts` | Per-student discount: `discount_type` fixed/percentage, nullable `school_fee_id`, void columns |
| `default_discounts` | Reusable templates. unique(institution_id, name) |
| `grade_level_discounts` | Bulk per-grade discounts |
| `student_additional_fees` | Per-student charges (name, amount). `source` `manual`/`late_fee`; late fees carry `installment_sequence`, `late_fee_percentage` (frozen), `base_amount` (re-based to the current installment), unique per (institution, student, year, sequence). Soft-deleted (a deleted late fee = waived) |
| `payment_void_requests` | `receipt_number`, `status` pending/approved/disapproved, request/review notes, requested_by/reviewed_by |
| `payment_receipt_submissions` | Student-uploaded receipt: `installment_sequence/label`, R2 `file_path`, `status` pending/approved/rejected, `review_note`, `amount` (verified), `student_payment_id` (set on approval) |
| `payment_plans` / `payment_plan_installments` | Plans + installment rows (sequence, label, due_month/day, share_percentage, grace, late fee) |
| `student_payment_plans` | Student's chosen plan, unique(institution, student, year); changes audited in `student_payment_plan_changes` |
| `finance_data_clear_logs` | One completed data clear: `academic_year`, `groups` (json), `deleted_counts` (json, per table), `total_deleted`, `files_deleted`/`files_failed`, `cleared_by` + snapshotted name/role. Written in the clear's own transaction; never cleared by it |

---

## Roles & permissions

- **Sidebar/UI access**: `super-administrator`, `principal`, `institution-administrator`,
  `finance` (the Finance, Payment Plans, and Announcements links). The routes themselves are not role-guarded in
  the frontend router — the sidebar is the gate.
- **Void workflow** (mirrored front + back):
  - `VOID_APPROVER_ROLES` in `Finance.tsx` = `finance`, `institution-administrator`, `principal`,
    `super-administrator` → can approve/disapprove a queued request.
  - `VOID_SELF_APPROVER_ROLES` = the same list minus `finance` → their own requests auto-approve
    and void immediately. A void `finance` raises from the Ledger still lands in the queue, so the
    request and its approval remain two records even though finance can action both.
  - `canRequestVoid` = `finance` role or approver → sees the Void Requests tab and the per-row
    **payment** void button in the Ledger.
  - `canVoidDiscount` = `can('discounts', 'void')` → the per-row **discount** void button. The
    Ledger's Action column is drawn when either flag is set (`showLedgerActions`), so a role with
    only one of the two abilities sees only its own buttons.
  - Backend enforcement lives in `PaymentVoidRequestController` (`REQUESTER_ROLES`,
    `APPROVER_ROLES`, `SELF_APPROVING_ROLES`) for payments, and in the `module:discounts,void`
    middleware + `canVoid()` for discounts; other finance controllers rely on institution
    scoping only, **not** roles — keep that in mind before exposing new endpoints.
- **Data clearing**: `finance.clear-data` ("Clear Finance data"), a special ability listed under
  Finance in the role builder. Held by `institution-administrator` and `principal`; deliberately
  **not** by `finance` — the cashier runs the money screens all day, and the one irreversible action
  among them should need a second person. `finance.manage` does **not** imply it (special abilities
  are exact permission strings; see `HasModulePermissions::hasModuleAccess`). Enforced on all four
  `finance/data-clear*` routes, re-checked in `Finance.tsx` (`canClearFinanceData`) and again by the
  `RequireModule module="finance" ability="clear-data"` route guard. Existing tenants were granted it
  by `2026_08_08_120100_grant_finance_clear_data_permission`, which goes **by role slug** rather than
  off `finance.manage` — inferring it from manage would have handed the delete to every cashier.

---

## Integration & consumers

Changing ledger/NOA response shapes or payment/discount semantics breaks these:

- **My Finance** (`src/pages/MyFinance.tsx`, student portal, `/my-finance`) — read-only student
  view; loads profile via `studentService` and finance data via the same student-scoped endpoints.
- **Student Finance tab** (`src/pages/Students/components/StudentFinanceTab.tsx`) — inside the
  Students module; uses `studentFinanceService` (ledger + NOA), `paymentPlanService`
  (plans + change history), and `studentOnlinePaymentService` (online payment transactions —
  a separate module that also writes payments).
- **StudentNOAPDF** (`src/components/StudentNOAPDF.tsx`) — shared by Finance ledger and the
  student-facing surfaces; consumes the `/students/{id}/noa` payload verbatim.
- **HRIS Payroll** is unrelated (staff money, not student money) despite the similar domain.

---

## Adding a new Finance view

1. **Route**: add `<Route path="finance/<slug>" element={<Finance />} />` in `src/App.tsx`.
2. **View type**: add the slug to the `FinanceView` union and to the `view` memo's pathname
   mapping in `Finance.tsx`.
3. **Nav**: add an entry to `PRIMARY_NAV` (daily-use surface) or `SETUP_NAV` + `SETUP_VIEWS`
   (configuration surface). Gate it with a `requiresVoidAccess`-style flag if role-restricted.
4. **Subtitle**: add a line to `VIEW_SUBTITLES`.
5. **Body**: add a `{view === '<slug>' && (…)}` block. Prefer a **separate component file** in
   `src/pages/Finance/` (like `CollectionsView.tsx`) over growing `Finance.tsx` further; pass
   shared props (`academicYearOptions`, `defaultAcademicYear`, `gradeLevelOptions`, `fees`) as
   the existing sub-views do.
6. **Queries**: guard every query with `enabled: view === '<slug>'` so other tabs don't fire it,
   and invalidate the relevant keys (`student-ledger`, `student-noa`, `finance-dashboard`,
   `cashier-ledger`) after mutations that change balances.

## Gotchas

- `Finance.tsx` is very large (~3,000 lines); most historical views live inline. New work should
  go in sub-view components.
- Additional fees are **not** `school_fees` — in cashiering they are paid as general lines
  (`school_fee_id: null`), so per-fee payment reports won't attribute them.
- `receipt_number` is unique on `payment_transactions` but **shared** across that transaction's
  `student_payments` lines (the old unique index on lines was dropped).
- Payment voids are keyed by `receipt_number` and void the whole receipt, not a single line.
- The mutation `onError` handlers use `error: any` throughout — pre-existing lint errors
  (`@typescript-eslint/no-explicit-any`) that predate current work; match local style but don't
  add new ones in fresh files.
- **Every foreign key between the finance tables is `CASCADE` or `SET NULL` — none is `RESTRICT`.**
  Deleting a `school_fees` row does not fail while payments reference it; it nulls their
  `school_fee_id` and they silently become "General / Other" lines. Any new bulk-delete or cleanup
  path needs the same survivor check Data Clearing does
  (`FinanceDataGroups::dependents()`), because the database will not catch it.
- **Not yet wired**: no export (CSV/print) on Collections or the Dashboard; no backend role
  middleware on finance routes beyond the void controller; frontend routes aren't role-guarded
  (sidebar-only gating).
