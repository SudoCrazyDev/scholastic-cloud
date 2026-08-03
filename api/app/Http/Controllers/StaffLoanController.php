<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollCompensation;
use App\Models\Role;
use App\Models\StaffLoan;
use App\Models\StaffLoanEvent;
use App\Models\StaffLoanInstallment;
use App\Models\User;
use App\Services\StaffLoanService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Staff loans: encode, price, approve, and watch payroll collect them.
 *
 * Two abilities are at work. `payroll.manage` encodes a loan and it lands
 * pending — nothing comes off anybody's salary yet. `payroll.approve-loan`
 * signs it off, which is the moment the schedule is written and payroll starts
 * picking it up. Whoever holds only the first can propose a deduction against a
 * colleague's pay but cannot impose one.
 */
class StaffLoanController extends Controller
{
    public function __construct(private readonly StaffLoanService $loans) {}

    public function index(Request $request): JsonResponse
    {
        if (! $this->canView($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $query = StaffLoan::with(['staff', 'requester', 'reviewer', 'installments'])
            ->where('institution_id', $institutionId);

        if ($request->filled('status')) {
            $query->where('status', $request->get('status'));
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->get('user_id'));
        }

        if ($request->filled('search')) {
            $search = $request->get('search');
            $query->where(function ($outer) use ($search) {
                $outer->where('reference_no', 'like', "%{$search}%")
                    ->orWhere('purpose', 'like', "%{$search}%")
                    ->orWhereHas('staff', function ($staff) use ($search) {
                        $staff->where('first_name', 'like', "%{$search}%")
                            ->orWhere('middle_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        // Pending first — they are the ones waiting on somebody.
        $loans = $query
            ->orderByRaw("CASE WHEN status = ? THEN 0 ELSE 1 END", [StaffLoan::STATUS_PENDING])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $loans->map(fn (StaffLoan $loan) => $this->serialize($loan))->values(),
            'meta' => [
                'can_approve' => $this->canApprove($request),
                'can_manage' => $this->canManage($request),
            ],
        ]);
    }

    /**
     * Staff who can be lent to, with the rate payroll already knows about.
     *
     * Only employees with a compensation record are offered: a loan is
     * collected off a payslip, and somebody with no rate generates none.
     */
    public function borrowers(Request $request): JsonResponse
    {
        if (! $this->canView($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $compensations = PayrollCompensation::where('institution_id', $institutionId)
            ->get()
            ->keyBy('user_id');

        $excludedRoleIds = Role::whereIn('slug', ['super-administrator', 'student'])->pluck('id');

        $staff = User::whereIn('id', $compensations->keys())
            ->whereHas('userInstitutions', function ($query) use ($institutionId, $excludedRoleIds) {
                $query->where('institution_id', $institutionId);
                if ($excludedRoleIds->isNotEmpty()) {
                    $query->where(function ($sub) use ($excludedRoleIds) {
                        $sub->whereNull('role_id')->orWhereNotIn('role_id', $excludedRoleIds);
                    });
                }
            })
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get();

        // What each of them still owes, so the form can warn before piling a
        // second loan on top of an unfinished one.
        $outstanding = StaffLoan::where('institution_id', $institutionId)
            ->where('status', StaffLoan::STATUS_APPROVED)
            ->get()
            ->groupBy('user_id')
            ->map(fn ($group) => round($group->sum(fn (StaffLoan $loan) => $loan->balance()), 2));

        return response()->json([
            'success' => true,
            'data' => $staff->map(fn (User $user) => [
                'user_id' => $user->id,
                'staff_name' => $this->staffName($user),
                'email' => $user->email,
                'daily_rate' => (float) ($compensations->get($user->id)?->daily_rate ?? 0),
                'outstanding_balance' => (float) ($outstanding[$user->id] ?? 0),
            ])->values(),
        ]);
    }

    /**
     * Price a set of terms without saving anything.
     *
     * The form previews the schedule as it is typed, but the figure that
     * matters is the one the server works out — this is that same call, so
     * what an approver sees before signing is what payroll will collect.
     */
    public function quote(Request $request): JsonResponse
    {
        if (! $this->canManage($request)) {
            return $this->payrollForbidden();
        }

        $validated = $request->validate($this->termRules());

        return response()->json([
            'success' => true,
            'data' => $this->loans->quote(
                (float) $validated['principal_amount'],
                $validated['interest_method'] ?? StaffLoan::INTEREST_NONE,
                (float) ($validated['interest_rate_percent'] ?? 0),
                $validated['rate_period'] ?? StaffLoan::RATE_MONTHLY,
                (int) $validated['term_months'],
                Carbon::parse($validated['first_deduction_date'])
            ),
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        if (! $this->canView($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $loan = StaffLoan::with(['staff', 'requester', 'reviewer', 'installments', 'events.actor'])
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $loan) {
            return $this->notFound();
        }

        return response()->json([
            'success' => true,
            'data' => $this->serialize($loan, full: true),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->canManage($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $request->validate($this->rules($institutionId));
        $actor = $this->actor($request);

        $loan = DB::transaction(function () use ($validated, $institutionId, $actor) {
            $loan = StaffLoan::create($this->terms($validated) + [
                'institution_id' => $institutionId,
                'user_id' => $validated['user_id'],
                'reference_no' => $this->loans->nextReference($institutionId),
                'status' => StaffLoan::STATUS_PENDING,
                'requested_by' => $actor?->id,
            ]);

            // Priced immediately, even while pending: an approver is signing
            // off a peso figure, not a rate, and the figure has to be on the
            // record before anybody agrees to it.
            $this->loans->writeSchedule($loan);
            $this->loans->log(
                $loan,
                StaffLoanEvent::ACTION_CREATED,
                $actor,
                (float) $loan->principal_amount,
                $validated['purpose'] ?? null
            );

            return $loan;
        });

        return response()->json([
            'success' => true,
            'message' => 'Loan '.$loan->reference_no.' recorded — waiting for approval.',
            'data' => $this->serialize($loan->fresh(['staff', 'requester', 'reviewer', 'installments']), full: true),
        ], 201);
    }

    /**
     * Edit a loan that has not been approved yet. Re-prices it from scratch.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        if (! $this->canManage($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $loan = StaffLoan::where('institution_id', $institutionId)->find($id);
        if (! $loan) {
            return $this->notFound();
        }

        if (! $loan->isPending()) {
            return $this->onlyPending('edited');
        }

        $validated = $request->validate($this->rules($institutionId));
        $actor = $this->actor($request);

        DB::transaction(function () use ($loan, $validated, $actor) {
            $loan->update($this->terms($validated) + ['user_id' => $validated['user_id']]);
            $this->loans->writeSchedule($loan);
            $this->loans->log($loan, StaffLoanEvent::ACTION_UPDATED, $actor, (float) $loan->principal_amount);
        });

        return response()->json([
            'success' => true,
            'message' => 'Loan updated.',
            'data' => $this->serialize($loan->fresh(['staff', 'requester', 'reviewer', 'installments']), full: true),
        ]);
    }

    /**
     * Delete a loan nobody has approved. An approved one is cancelled instead —
     * it has a history against somebody's salary and that does not get erased.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        if (! $this->canManage($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $loan = StaffLoan::where('institution_id', $institutionId)->find($id);
        if (! $loan) {
            return $this->notFound();
        }

        if (! $loan->isPending()) {
            return $this->onlyPending('deleted');
        }

        $loan->delete();

        return response()->json(['success' => true, 'message' => 'Loan deleted.']);
    }

    public function approve(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $loan = StaffLoan::where('institution_id', $institutionId)->find($id);
        if (! $loan) {
            return $this->notFound();
        }

        if (! $loan->isPending()) {
            return $this->onlyPending('approved');
        }

        $validated = $request->validate(['review_note' => 'nullable|string|max:1000']);
        $actor = $this->actor($request);

        DB::transaction(function () use ($loan, $validated, $actor) {
            // Re-priced on the way through. The schedule was written when the
            // loan was encoded, but this is the figure being signed off, and
            // it should be produced by the act of signing rather than trusted
            // from whatever was sitting in the row.
            $this->loans->writeSchedule($loan);

            $loan->update([
                'status' => StaffLoan::STATUS_APPROVED,
                'reviewed_by' => $actor?->id,
                'reviewed_at' => now(),
                'review_note' => $validated['review_note'] ?? null,
            ]);

            $this->loans->log(
                $loan,
                StaffLoanEvent::ACTION_APPROVED,
                $actor,
                (float) $loan->total_payable,
                $validated['review_note'] ?? null
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'Loan approved — it will be collected from the next payroll run.',
            'data' => $this->serialize($loan->fresh(['staff', 'requester', 'reviewer', 'installments']), full: true),
        ]);
    }

    public function reject(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $loan = StaffLoan::where('institution_id', $institutionId)->find($id);
        if (! $loan) {
            return $this->notFound();
        }

        if (! $loan->isPending()) {
            return $this->onlyPending('rejected');
        }

        $validated = $request->validate(['review_note' => 'required|string|max:1000'], [
            'review_note.required' => 'Say why the loan is being turned down.',
        ]);
        $actor = $this->actor($request);

        DB::transaction(function () use ($loan, $validated, $actor) {
            // The schedule was priced when the loan was encoded; a rejection
            // strikes every row of it out. Off the model rather than the
            // relation, whose ORDER BY has no business in an UPDATE.
            StaffLoanInstallment::where('staff_loan_id', $loan->id)
                ->update(['status' => StaffLoanInstallment::STATUS_CANCELLED]);
            $loan->update([
                'status' => StaffLoan::STATUS_REJECTED,
                'reviewed_by' => $actor?->id,
                'reviewed_at' => now(),
                'review_note' => $validated['review_note'],
            ]);

            $this->loans->log($loan, StaffLoanEvent::ACTION_REJECTED, $actor, null, $validated['review_note']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Loan rejected.',
            'data' => $this->serialize($loan->fresh(['staff', 'requester', 'reviewer', 'installments']), full: true),
        ]);
    }

    /**
     * Stop collecting an approved loan. What has already come off payslips
     * stays off — this closes the deduction, it does not refund it.
     */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $loan = StaffLoan::where('institution_id', $institutionId)->find($id);
        if (! $loan) {
            return $this->notFound();
        }

        if (! $loan->isCollectable()) {
            return response()->json([
                'success' => false,
                'message' => 'Only an approved loan that is still being collected can be cancelled.',
            ], 422);
        }

        $validated = $request->validate(['review_note' => 'required|string|max:1000'], [
            'review_note.required' => 'Say why the loan is being called off.',
        ]);

        $this->loans->cancel($loan, $this->actor($request), $validated['review_note']);

        return response()->json([
            'success' => true,
            'message' => 'Loan cancelled — nothing further will be deducted.',
            'data' => $this->serialize($loan->fresh(['staff', 'requester', 'reviewer', 'installments']), full: true),
        ]);
    }

    /**
     * The terms half of the payload, shared by the quote endpoint and the save.
     *
     * @return array<string, mixed>
     */
    private function termRules(): array
    {
        return [
            'principal_amount' => 'required|numeric|min:1|max:9999999',
            'interest_method' => ['nullable', Rule::in(StaffLoan::INTEREST_METHODS)],
            'interest_rate_percent' => 'nullable|numeric|min:0|max:100',
            'rate_period' => ['nullable', Rule::in(StaffLoan::RATE_PERIODS)],
            // Five years is already an unusual staff loan; past that it is
            // almost certainly a typo in the months field.
            'term_months' => 'required|integer|min:1|max:60',
            'first_deduction_date' => 'required|date',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function rules(string $institutionId): array
    {
        return $this->termRules() + [
            'user_id' => [
                'required',
                'uuid',
                // The borrower has to be somebody payroll pays: a loan is
                // collected off a payslip, and a staff member with no rate
                // never generates one.
                Rule::exists('payroll_compensations', 'user_id')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId)),
            ],
            'purpose' => 'nullable|string|max:255',
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function terms(array $validated): array
    {
        $method = $validated['interest_method'] ?? StaffLoan::INTEREST_NONE;
        $charges = $method !== StaffLoan::INTEREST_NONE;

        return [
            'purpose' => $validated['purpose'] ?? null,
            'principal_amount' => $validated['principal_amount'],
            'interest_method' => $method,
            // An interest-free loan keeps no rate. Leaving one behind would
            // reappear the moment somebody switched the method back.
            'interest_rate_percent' => $charges ? ($validated['interest_rate_percent'] ?? 0) : 0,
            'rate_period' => $charges
                ? ($validated['rate_period'] ?? StaffLoan::RATE_MONTHLY)
                : StaffLoan::RATE_MONTHLY,
            'term_months' => $validated['term_months'],
            'first_deduction_date' => $validated['first_deduction_date'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(StaffLoan $loan, bool $full = false): array
    {
        $installments = $loan->relationLoaded('installments') ? $loan->installments : collect();
        $collected = $installments->where('status', StaffLoanInstallment::STATUS_COLLECTED);

        $data = [
            'id' => $loan->id,
            'reference_no' => $loan->reference_no,
            'user_id' => $loan->user_id,
            'staff_name' => $this->staffName($loan->staff),
            'purpose' => $loan->purpose,
            'principal_amount' => (float) $loan->principal_amount,
            'interest_method' => $loan->interest_method,
            'interest_rate_percent' => (float) $loan->interest_rate_percent,
            'rate_period' => $loan->rate_period,
            'term_months' => (int) $loan->term_months,
            'interest_amount' => (float) $loan->interest_amount,
            'total_payable' => (float) $loan->total_payable,
            'installment_amount' => (float) $loan->installment_amount,
            'amount_paid' => (float) $loan->amount_paid,
            'balance' => $loan->balance(),
            'installments_paid' => $collected->count(),
            'first_deduction_date' => $loan->first_deduction_date?->toDateString(),
            'next_due_date' => $installments
                ->firstWhere('status', StaffLoanInstallment::STATUS_SCHEDULED)
                ?->due_date?->toDateString(),
            'status' => $loan->status,
            // Who put this deduction on the staff member's salary, and who let
            // it happen. Both are on the list row, not buried in the detail.
            'requested_by' => $loan->requester?->id,
            'requested_by_name' => $this->staffName($loan->requester),
            'requested_at' => $loan->created_at?->toIso8601String(),
            'reviewed_by' => $loan->reviewer?->id,
            'reviewed_by_name' => $this->staffName($loan->reviewer),
            'reviewed_at' => $loan->reviewed_at?->toIso8601String(),
            'review_note' => $loan->review_note,
            'completed_at' => $loan->completed_at?->toIso8601String(),
        ];

        if (! $full) {
            return $data;
        }

        return $data + [
            'installments' => $installments->map(fn (StaffLoanInstallment $installment) => [
                'id' => $installment->id,
                'sequence' => (int) $installment->sequence,
                'due_date' => $installment->due_date?->toDateString(),
                'amount' => (float) $installment->amount,
                'principal_component' => (float) $installment->principal_component,
                'interest_component' => (float) $installment->interest_component,
                'opening_balance' => (float) $installment->opening_balance,
                'closing_balance' => (float) $installment->closing_balance,
                'status' => $installment->status,
                'collected_amount' => (float) $installment->collected_amount,
                'collected_at' => $installment->collected_at?->toIso8601String(),
                'payslip_id' => $installment->payslip_id,
            ])->values(),
            'events' => ($loan->relationLoaded('events') ? $loan->events : collect())
                ->map(fn (StaffLoanEvent $event) => [
                    'id' => $event->id,
                    'action' => $event->action,
                    // The stored name first: it is what was true at the time.
                    'actor_name' => $event->actor_name ?: $this->staffName($event->actor),
                    'amount' => $event->amount !== null ? (float) $event->amount : null,
                    'note' => $event->note,
                    'created_at' => $event->created_at?->toIso8601String(),
                ])->values(),
        ];
    }

    /**
     * The signed-in staff member, or null.
     *
     * A student cannot reach any of this — the module gate turns them away
     * first — but the loan trail is typed to a staff user, so the narrowing is
     * done here rather than trusted.
     */
    private function actor(Request $request): ?User
    {
        $user = $request->user();

        return $user instanceof User ? $user : null;
    }

    private function staffName(?User $user): ?string
    {
        if (! $user) {
            return null;
        }

        $name = trim(implode(' ', array_filter([$user->first_name, $user->middle_name, $user->last_name])));

        return $name !== '' ? $name : $user->email;
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        return $institutionId;
    }

    private function canView(Request $request): bool
    {
        return $this->holds($request, 'view');
    }

    private function canManage(Request $request): bool
    {
        return $this->holds($request, 'manage');
    }

    private function canApprove(Request $request): bool
    {
        return $this->holds($request, 'approve-loan');
    }

    /**
     * Payroll is restricted to roles granted the module — salaries are too
     * sensitive for the usual "any staff" HRIS access. Read off permissions
     * rather than a fixed slug list, so a school can build its own payroll
     * role, and so a super-administrator's wildcard reaches it like anything
     * else.
     */
    private function holds(Request $request, string $ability): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        return $user->hasModuleAccess('payroll', $ability);
    }

    private function payrollForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'You are not allowed to manage payroll',
        ], 403);
    }

    private function noInstitution(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'User does not have any institution assigned',
        ], 400);
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Loan not found',
        ], 404);
    }

    private function onlyPending(string $verb): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Only a loan that is still waiting for approval can be '.$verb.'.',
        ], 422);
    }
}
