# Module: Finance

> Context doc for working on or integrating with the **Finance** module — the staff-facing money
> side of the app: fee setup, cashiering (POS), student ledgers, collections reporting, discounts,
> receipt templates, and payment-void approvals. Use the [file map](#file-map) to jump straight to
> whatever a new feature touches, and [Adding a new Finance view](#adding-a-new-finance-view) for
> the exact steps to extend the page.

Location in nav: **Finance → Finance** (`/finance` and `/finance/*`) and **Finance → Payment
Plans** (`/payment-plans`, a standalone page **outside** the Finance tab shell). Sidebar
`allowedRoles` for both: `super-administrator`, `principal`, `institution-administrator`,
`finance`. Students see their own money at **My Finance** (`/my-finance`) — a separate page, not
part of this shell.

Everything is **institution-scoped**: backend controllers resolve the institution from the
authenticated user (`resolveInstitutionId`); there is **no per-route role middleware** on Finance
routes — only `auth.token` plus in-controller checks (see [Roles & permissions](#roles--permissions)).

---

## Page architecture: one component, ten URLs

`app/src/pages/Finance/Finance.tsx` is a single ~3,000-line component that renders one of ten
**views** based on `location.pathname` (the `view` memo near the top of the component). Every
`/finance/*` path in `src/App.tsx` renders the same `<Finance />`; the URL is the tab state, so
views are bookmarkable and there is no tab state to persist.

Navigation is **two-level** (data-driven constants at the top of `Finance.tsx`):

- `PRIMARY_NAV` — the top row: **Dashboard**, **Cashiering**, **Ledger**, **Collections**,
  **Void Requests** (only when `canRequestVoid`), and **Setup**.
- `SETUP_NAV` — a sub-row that appears only while a setup view is active: **School Fees**,
  **Default Amounts**, **Grade Level Discounts**, **Default Discounts**, **Receipt Builder**.
  The "Setup" primary item links to `/finance/school-fees` and is highlighted whenever `view` is
  in `SETUP_VIEWS`.
- `VIEW_SUBTITLES` — per-view one-liner shown under the page `h1`.

| View (`FinanceView`) | URL | What it is |
|---|---|---|
| `dashboard` | `/finance` | Collections summary + charts for an academic year |
| `cashiering` | `/finance/cashiering` | POS: take a multi-line payment, print receipt |
| `ledger` | `/finance/ledger` | Per-student account: charges, payments, discounts, NOA |
| `collections` | `/finance/collections` | Monthly/quarterly collections by payment method |
| `void-requests` | `/finance/void-requests` | Payment void request queue (role-gated) |
| `school-fees` | `/finance/school-fees` | Setup: fee type catalog |
| `default-amounts` | `/finance/default-amounts` | Setup: fee amount per grade level per year |
| `discounts` | `/finance/discounts` | Setup: bulk discounts for a whole grade level |
| `default-discounts` | `/finance/default-discounts` | Setup: reusable discount templates |
| `receipt-builder` | `/finance/receipt-builder` | Setup: drag-and-drop receipt layout |

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
  separate transaction-items table. A line's `school_fee_id` is nullable: null means a
  "General / Other" payment (also used when paying an additional fee, since additional fees are
  not `school_fees` rows).
- **Discounts — three different things**:
  1. **Student discounts** (`student_discounts`) — applied to one student for a year, fixed or
     percentage, optionally tied to one fee or **split across fees** via `allocations`. Created
     from the Ledger view. Voidable directly (note required, no approval queue) via
     `POST /student-discounts/{id}/void`.
  2. **Grade-level discounts** (`grade_level_discounts`) — bulk discount for every student in a
     grade level for a year. Managed in Setup → Grade Level Discounts (`DiscountsView.tsx`).
  3. **Default discounts** (`default_discounts`) — named, reusable **templates** (e.g. "Sibling
     10%"). Managed in Setup → Default Discounts; the Ledger discount form can prefill from one.
- **Additional fees** (`student_additional_fees`) — ad-hoc per-student charges (name + amount),
  added from the Ledger view. They appear in the ledger/NOA fee breakdown flagged
  `is_additional`, and are paid as general (null `school_fee_id`) lines in cashiering.
- **Payment plans** (`payment_plans` + `payment_plan_installments`) — institution-defined
  installment schedules (label, due month/day, share %, grace days, late fee). A student's chosen
  plan lives in `student_payment_plans` (unique per student+year), with every change audited in
  `student_payment_plan_changes`. Plans are managed on the standalone `/payment-plans` page; the
  Ledger's monthly/quarterly schedule views and My Finance consume them.
- **Void workflow (payments)** — voiding a posted payment goes through
  `payment_void_requests`, keyed by `receipt_number`. `finance` submits a request (note
  required); approver roles approve/disapprove with a review note. **When an approver submits a
  request themselves it is auto-approved and the payment is voided immediately** (backend
  behavior in `PaymentVoidRequestController@store`). Voided payments keep their rows —
  `student_payments` gets `voided_at/voided_by/void_note`.
- **NOA (Notice of Account)** — printable statement per student+year, rendered client-side by
  `StudentNOAPDF` (`@react-pdf/renderer`) from `GET /students/{id}/noa`.
- **Receipts** — printed via `ReceiptPrintModal`, which lays the transaction out according to the
  active **receipt template** (`receipt-templates` API) built in the Receipt Builder.

---

## File map

**Frontend (`app/`)**
- Shell + Dashboard/Cashiering/Ledger/School Fees/Default Amounts/Void Requests views:
  `src/pages/Finance/Finance.tsx` (nav constants `PRIMARY_NAV`/`SETUP_NAV`/`VIEW_SUBTITLES` at
  top; `view` memo maps pathname → view).
- Sub-view components (same folder): `CollectionsView.tsx`, `DiscountsView.tsx` (grade-level),
  `DefaultDiscountsView.tsx`, `ReceiptBuilderView.tsx`, `ReceiptPrintModal.tsx`,
  `DashboardCharts.tsx` (Recharts, presentational), `PaymentPlansView.tsx` (standalone page).
- Shared PDF: `src/components/StudentNOAPDF.tsx`.
- Services (`src/services/`): `schoolFeeService.ts`, `schoolFeeDefaultService.ts`,
  `financeDashboardService.ts`, `studentPaymentService.ts`, `studentFinanceService.ts`,
  `studentDiscountService.ts`, `defaultDiscountService.ts`, `gradeLevelDiscountService.ts`,
  `studentAdditionalFeeService.ts`, `paymentVoidService.ts`, `paymentPlanService.ts`,
  `receiptTemplateService.ts`, plus `studentService.ts` for student search.
- Types: `src/types/index.ts` (`SchoolFee`, `SchoolFeeDefault`, `PaymentTransaction`,
  `StudentLedgerEntry`, `CreateStudentDiscountData`, `DefaultDiscount`, `PaymentVoidStatus`, …).
- Routes: `src/App.tsx` — `finance` + nine `finance/*` routes all render `<Finance />`;
  `payment-plans` renders `<PaymentPlansView />` directly. Sidebar: `src/components/sidebar/Sidebar.tsx`
  (Finance section).

**Backend (`api/`)**
- Routes: `routes/api.php`, all inside the `auth.token` group — school-fees apiResource + finance
  dashboard/collections + school-fee-defaults (~lines 297–305), student-payments +
  payment-transactions (~306–311), student-discounts (+`/void`) (~316–321), default-discounts
  apiResource (~324), grade-level-discounts (~327–331), student-additional-fees (~334–338),
  payment-void-requests (~341–344), receipt-templates apiResource (~347), and the
  student-scoped ledger/NOA/payment-plan routes (~177–182).
- Controllers (`app/Http/Controllers/`): `SchoolFeeController`, `SchoolFeeDefaultController`,
  `FinanceDashboardController` (`summary`, `collections`), `StudentPaymentController` (store =
  create transaction + lines), `PaymentTransactionController`, `StudentDiscountController`,
  `DefaultDiscountController`, `GradeLevelDiscountController`, `StudentAdditionalFeeController`,
  `PaymentVoidRequestController`, `StudentFinanceController` (`ledger`, `noticeOfAccount`),
  `StudentPaymentPlanController`, `StudentPaymentPlanChangeController`, `PaymentPlanController`,
  `ReceiptTemplateController`.
- Models (`app/Models/`): `SchoolFee`, `SchoolFeeDefault`, `StudentPayment`,
  `PaymentTransaction`, `StudentDiscount`, `DefaultDiscount`, `GradeLevelDiscount`,
  `StudentAdditionalFee`, `PaymentVoidRequest`, `PaymentPlan`, `PaymentPlanInstallment`,
  `StudentPaymentPlan`, `StudentPaymentPlanChange`.

---

## Views in detail

### Dashboard (`/finance`)
Academic-year selector → `GET /finance/dashboard?academic_year=` (`financeDashboardService.getSummary`).
Response `data` has `fees` (per-fee payable/collected) and `grades` (per-grade summaries); rendered
as stat cards + tables + `DashboardCharts` (pie: payments by fee; bars: by grade / collectibles).
Read-only.

### Cashiering (`/finance/cashiering`)
The POS. Debounced student search (min 2 chars) → select a student → their ledger
`fee_breakdown` loads (reusing `GET /students/{id}/ledger`) showing each fee's outstanding
balance. The cashier types amounts per fee line (a "Pay full" shortcut fills the outstanding
amount), plus an optional "General / Other" free-form line, payment method, OR number,
amount tendered (change computed client-side). Overpaying a line only warns (advance payment is
allowed). Submit → `POST /student-payments` with `items[]` → creates one `PaymentTransaction` +
one `StudentPayment` per line, returns the transaction, and opens `ReceiptPrintModal` for
printing. Invalidates `finance-dashboard`, `student-ledger`, `cashier-ledger` query keys.

### Ledger (`/finance/ledger`)
Same student search → `GET /students/{id}/ledger` + `GET /students/{id}/noa`. Three view modes:
`entries` (chronological charges/payments/discounts), `monthly`, `quarterly` (installment
schedule tables with cumulative due/paid/remaining, driven by the student's payment plan). From
here staff can:
- **Apply a discount** — fixed/percentage, optionally prefilled from a default discount; fixed
  discounts can be **split across fees** with allocation rows that must sum exactly to the total.
  → `POST /student-discounts`.
- **Add an additional fee** — name + amount → `POST /student-additional-fees`.
- **Void a discount** — note required → `POST /student-discounts/{id}/void` (direct, no queue).
- **Request a payment void** — note required, keyed by the entry's `receipt_number` →
  `POST /payment-void-requests` (goes to the approval queue unless requester is an approver).
- **Download the NOA PDF** (`PDFDownloadLink` + `StudentNOAPDF`).

### Collections (`/finance/collections`) — `CollectionsView.tsx`
`GET /finance/collections?academic_year=` → monthly/quarterly totals with a per-payment-method
breakdown (school year June–March). Read-only.

### Void Requests (`/finance/void-requests`)
Visible only when `canRequestVoid` (frontend) — `finance` role or an approver role. Lists
`GET /payment-void-requests?status=` with a status filter. Approvers get Approve / Disapprove
(review note required for disapprove). Approving voids the underlying payment(s); the view
invalidates ledger/NOA queries afterwards.

### Setup → School Fees (`/finance/school-fees`)
CRUD on the fee catalog (`name`, `description`, `is_active`) via `/school-fees`.

### Setup → Default Amounts (`/finance/default-amounts`)
Fee amounts per grade level + academic year via `/school-fee-defaults`. Supports single upsert,
`apply_to_all` (every grade at once → `/school-fee-defaults/apply-all`), and bulk upsert. Filterable
by grade/year.

### Setup → Grade Level Discounts (`/finance/discounts`) — `DiscountsView.tsx`
Bulk discounts applied to an entire grade level for a year (fixed/percentage, optionally tied to
one fee) via `/grade-level-discounts`. Create + delete only.

### Setup → Default Discounts (`/finance/default-discounts`) — `DefaultDiscountsView.tsx`
CRUD on reusable discount templates via `/default-discounts` (name, type, value, active flag).

### Setup → Receipt Builder (`/finance/receipt-builder`) — `ReceiptBuilderView.tsx`
Drag-and-drop (dnd-kit) template designer with a palette of ~17 element types (institution
logo/name/address, receipt number, student fields, fee/amount rows, signature line, custom text,
divider, spacer…). CRUD via `/receipt-templates`. `ReceiptPrintModal` renders the active template.

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
| `financeDashboardService` | GET `/finance/dashboard`, GET `/finance/collections` |
| `studentPaymentService` | GET/POST `/student-payments`, GET `/student-payments/{id}[/receipt]`, GET `/payment-transactions/{id}[/receipt]` |
| `studentFinanceService` | GET `/students/{id}/ledger`, GET `/students/{id}/noa`, GET/POST `/students/{id}/payment-plan` |
| `studentDiscountService` | GET/POST/DELETE `/student-discounts`, POST `/student-discounts/{id}/void` |
| `defaultDiscountService` | CRUD `/default-discounts` |
| `gradeLevelDiscountService` | CRUD `/grade-level-discounts` |
| `studentAdditionalFeeService` | CRUD `/student-additional-fees` |
| `paymentVoidService` | GET/POST `/payment-void-requests`, POST `…/{id}/approve`, POST `…/{id}/disapprove` |
| `paymentPlanService` | CRUD `/payment-plans`, GET `/payment-plan-changes` |
| `receiptTemplateService` | CRUD `/receipt-templates` |

All requests go through `src/lib/api.ts` (base `VITE_API_URL`, token auth).

---

## Data model (tables at a glance)

| Table | Purpose / key columns |
|---|---|
| `school_fees` | Fee catalog. unique(institution_id, name), `is_active` |
| `school_fee_defaults` | Amount per fee+grade+year. unique(school_fee_id, grade_level, academic_year) |
| `payment_transactions` | Receipt header: `receipt_number` (unique), `total_amount`, `amount_tendered`, `change_due`, `or_number`-era fields |
| `student_payments` | Payment **lines**: nullable `school_fee_id`, `payment_transaction_id`, `receipt_number` (shared across lines), void columns (`voided_at/voided_by/void_note`) |
| `student_discounts` | Per-student discount: `discount_type` fixed/percentage, nullable `school_fee_id`, void columns |
| `default_discounts` | Reusable templates. unique(institution_id, name) |
| `grade_level_discounts` | Bulk per-grade discounts |
| `student_additional_fees` | Ad-hoc per-student charges (name, amount) |
| `payment_void_requests` | `receipt_number`, `status` pending/approved/disapproved, request/review notes, requested_by/reviewed_by |
| `payment_plans` / `payment_plan_installments` | Plans + installment rows (sequence, label, due_month/day, share_percentage, grace, late fee) |
| `student_payment_plans` | Student's chosen plan, unique(institution, student, year); changes audited in `student_payment_plan_changes` |

---

## Roles & permissions

- **Sidebar/UI access**: `super-administrator`, `principal`, `institution-administrator`,
  `finance` (both Finance and Payment Plans links). The routes themselves are not role-guarded in
  the frontend router — the sidebar is the gate.
- **Void workflow** (mirrored front + back):
  - `VOID_APPROVER_ROLES` in `Finance.tsx` = `institution-administrator`, `principal`,
    `super-administrator` → can approve/disapprove, and their own requests auto-approve.
  - `canRequestVoid` = `finance` role or approver → sees the Void Requests tab and the per-row
    void buttons in the Ledger.
  - Backend enforcement lives in `PaymentVoidRequestController` (`REQUESTER_ROLES`,
    `APPROVER_ROLES`); other finance controllers rely on institution scoping only, **not** roles —
    keep that in mind before exposing new endpoints.

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
- **Not yet wired**: no export (CSV/print) on Collections or the Dashboard; no backend role
  middleware on finance routes beyond the void controller; frontend routes aren't role-guarded
  (sidebar-only gating).
