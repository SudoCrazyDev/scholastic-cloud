<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\FinanceDataClearLog;
use App\Services\Finance\FinanceDataCleaner;
use App\Support\FinanceDataGroups;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Clearing a year's Finance data.
 *
 * Every route here is behind `module:finance,clear-data` — a separate ability
 * from `finance.manage`, so running the POS does not carry the power to delete
 * what it recorded (see SystemRolePermissions).
 *
 * The screen this serves is a three-step affair on purpose: pick a year and the
 * groups, read back exactly what would go, then type the year to confirm. Both
 * {@see preview} and {@see store} answer from the same FinanceDataCleaner rules,
 * so the confirmation cannot describe a different operation from the one that
 * runs.
 *
 * Payment plans, finance announcements and disbursements have no group in
 * FinanceDataGroups and are never touched by any of this.
 */
class FinanceDataClearController extends Controller
{
    /**
     * The groups a school may clear, for building the form.
     */
    public function groups(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentRefusal();
        }

        $groups = [];

        foreach (FinanceDataGroups::all() as $key => $definition) {
            $groups[] = [
                'key' => $key,
                'label' => $definition['label'],
                'description' => $definition['description'],
                'scope' => $definition['scope'],
                'tables' => $definition['tables'],
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'groups' => $groups,
                // Named so the UI can state what is out of scope rather than
                // leaving its absence to be inferred from a list.
                'excluded' => [
                    'Payment plans and student plan assignments',
                    'Finance announcements',
                    'Disbursements, disbursement types and disbursement receipts',
                ],
            ],
        ]);
    }

    /**
     * Row counts for a proposed clear, plus anything blocking it.
     */
    public function preview(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentRefusal();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $request->validate([
            'academic_year' => ['required', 'string', 'regex:/^\d{4}-\d{4}$/'],
            'groups' => ['required', 'array', 'min:1'],
            'groups.*' => ['required', 'string', 'in:' . implode(',', FinanceDataGroups::keys())],
        ]);

        $cleaner = new FinanceDataCleaner($institutionId, $validated['academic_year']);

        return response()->json([
            'success' => true,
            'data' => $cleaner->preview($validated['groups']),
        ]);
    }

    /**
     * Perform the clear.
     */
    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentRefusal();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $request->validate([
            'academic_year' => ['required', 'string', 'regex:/^\d{4}-\d{4}$/'],
            'groups' => ['required', 'array', 'min:1'],
            'groups.*' => ['required', 'string', 'in:' . implode(',', FinanceDataGroups::keys())],
            // Typing the year back is the last gate. It is checked here and not
            // only in the browser: this endpoint deletes receipts, and a client
            // that skips the dialog should not be able to skip the intent.
            'confirmation' => ['required', 'string'],
        ], [
            'confirmation.required' => 'Type the academic year to confirm the clear.',
        ]);

        if (trim($validated['confirmation']) !== $validated['academic_year']) {
            return response()->json([
                'success' => false,
                'message' => 'Type the academic year exactly (' . $validated['academic_year'] . ') to confirm the clear.',
            ], 422);
        }

        $user = $request->user();
        $role = $user && method_exists($user, 'getRole') ? $user->getRole() : null;

        $cleaner = new FinanceDataCleaner($institutionId, $validated['academic_year']);

        try {
            $result = $cleaner->clear($validated['groups'], [
                'id' => $user?->id,
                'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: ($user->email ?? null),
                'role' => $role->slug ?? null,
            ]);
        } catch (RuntimeException $e) {
            // A guard refused: something outside the selected year would have
            // been stranded. Nothing was deleted.
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }

        // Worth a server-side trace independent of the audit table — this is the
        // one Finance action with no undo.
        Log::warning('Finance data cleared', [
            'institution_id' => $institutionId,
            'academic_year' => $validated['academic_year'],
            'groups' => $result['groups'],
            'total_deleted' => $result['total_deleted'],
            'cleared_by' => $user?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => $this->outcomeMessage($result),
            'data' => $result,
        ]);
    }

    /**
     * Past clears for this institution, newest first.
     */
    public function history(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentRefusal();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $logs = FinanceDataClearLog::where('institution_id', $institutionId)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (FinanceDataClearLog $log) => [
                'id' => $log->id,
                'academic_year' => $log->academic_year,
                'groups' => $log->groups,
                'group_labels' => array_map(
                    fn (string $group) => FinanceDataGroups::label($group),
                    $log->groups ?? [],
                ),
                'deleted_counts' => $log->deleted_counts,
                'total_deleted' => $log->total_deleted,
                'files_deleted' => $log->files_deleted,
                'files_failed' => $log->files_failed,
                'cleared_by_name' => $log->cleared_by_name,
                'cleared_by_role' => $log->cleared_by_role,
                'created_at' => $log->created_at,
            ]);

        return response()->json([
            'success' => true,
            'data' => $logs,
        ]);
    }

    /**
     * @param  array<string, mixed>  $result
     */
    private function outcomeMessage(array $result): string
    {
        $total = (int) $result['total_deleted'];

        if ($total === 0) {
            return 'Nothing to clear — the selected groups held no records for ' . $result['academic_year'] . '.';
        }

        $message = number_format($total) . ' ' . ($total === 1 ? 'record' : 'records')
            . ' cleared for ' . $result['academic_year'] . '.';

        if (($result['files_failed'] ?? 0) > 0) {
            $message .= ' ' . number_format($result['files_failed'])
                . ' uploaded receipt file(s) could not be removed from storage and are now orphaned.';
        }

        return $message;
    }

    private function studentRefusal(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Students are not allowed to access finance data clearing',
        ], 403);
    }

    private function noInstitution(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'User does not have any institution assigned',
        ], 400);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        return $institutionId;
    }

    private function isStudentUser(Request $request): bool
    {
        $user = $request->user();
        if (!$user) {
            return false;
        }

        if ($user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;
        return (string) ($role->slug ?? '') === 'student';
    }
}
