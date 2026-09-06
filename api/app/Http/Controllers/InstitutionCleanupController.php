<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Institution;
use App\Models\InstitutionCleanupLog;
use App\Services\Institution\InstitutionDataCleaner;
use App\Support\InstitutionCleanupGroups;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Emptying one institution back to its people.
 *
 * Platform administration, and the most destructive thing the platform can do:
 * a run deletes a tenant's academic, finance, HRIS, device and messaging records
 * across every academic year it has, keeping only its students and staff.
 *
 * ## Why the super-administrator check is written out here
 *
 * Every route is behind `module:institution-cleanup,manage`, and the module is
 * flagged `system_only` so no school can hand it out in its own role builder.
 * That is already the two gates the rest of the app relies on — and it is not
 * enough for this one. `system_only` governs what the *role builder offers*; it
 * does not stop a row being written into `role_permissions` by a migration, a
 * seeder, or a well-meant fix on a console. Every other system_only screen that
 * happened to leak would show someone a list. This one would let them empty a
 * live school.
 *
 * So the role slug is checked explicitly on all four endpoints,
 * {@see refuseUnlessSuperAdministrator()}, and it is deliberately a check on
 * identity rather than on a permission string: there is no permission that
 * grants this, only being the super-administrator.
 *
 * ## Why the institution is a parameter
 *
 * Unlike FinanceDataClearController — where a school clears its own year and the
 * institution is resolved from the operator — the target here is named in the
 * URL. A super-administrator has no meaningful "own institution", and a screen
 * that emptied whichever tenant their session happened to default to is the
 * single worst way to get this wrong.
 *
 * ## The shape of the operation
 *
 * Three steps on purpose, and the same three the Finance clear uses because they
 * work: pick the institution and the groups, read back exactly what would go,
 * then type the institution's name to confirm. {@see preview} and {@see store}
 * answer from the same InstitutionDataCleaner rules, so the confirmation cannot
 * describe a different operation from the one that runs.
 */
class InstitutionCleanupController extends Controller
{
    /**
     * The catalog: what a clean-up can delete, and what it never touches.
     */
    public function groups(Request $request): JsonResponse
    {
        if ($refusal = $this->refuseUnlessSuperAdministrator($request)) {
            return $refusal;
        }

        $groups = [];

        foreach (InstitutionCleanupGroups::all() as $key => $definition) {
            $groups[] = [
                'key' => $key,
                'label' => $definition['label'],
                'area' => $definition['area'],
                'description' => $definition['description'],
                'tables' => $definition['tables'],
                // Named so the screen can say that trashed rows go too. A waived
                // late fee and a deleted chat message are invisible in the app
                // and would otherwise survive a clear that claimed to take them.
                'includes_trashed' => $definition['soft_deletes'],
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'groups' => $groups,
                'kept' => InstitutionCleanupGroups::kept(),
                // Institutions are listed here rather than reusing the general
                // institutions endpoint so the screen cannot offer a target the
                // clean-up would not accept.
                'institutions' => Institution::query()
                    ->orderBy('title')
                    ->get(['id', 'title', 'abbr'])
                    ->map(fn (Institution $institution) => [
                        'id' => $institution->id,
                        'title' => $institution->title,
                        'abbr' => $institution->abbr,
                    ]),
            ],
        ]);
    }

    /**
     * Row counts for a proposed clean-up, plus anything blocking it.
     */
    public function preview(Request $request, string $institutionId): JsonResponse
    {
        if ($refusal = $this->refuseUnlessSuperAdministrator($request)) {
            return $refusal;
        }

        $institution = Institution::find($institutionId);
        if (! $institution) {
            return $this->unknownInstitution();
        }

        $validated = $request->validate([
            'groups' => ['required', 'array', 'min:1'],
            'groups.*' => ['required', 'string', 'in:' . implode(',', InstitutionCleanupGroups::keys())],
        ]);

        $cleaner = new InstitutionDataCleaner($institution->id);

        return response()->json([
            'success' => true,
            'data' => array_merge($cleaner->preview($validated['groups']), [
                'institution' => [
                    'id' => $institution->id,
                    'title' => $institution->title,
                ],
                // The promise, as a number. See retainedPeople().
                'retained' => $cleaner->retainedPeople(),
            ]),
        ]);
    }

    /**
     * Perform the clean-up.
     */
    public function store(Request $request, string $institutionId): JsonResponse
    {
        if ($refusal = $this->refuseUnlessSuperAdministrator($request)) {
            return $refusal;
        }

        $institution = Institution::find($institutionId);
        if (! $institution) {
            return $this->unknownInstitution();
        }

        $validated = $request->validate([
            'groups' => ['required', 'array', 'min:1'],
            'groups.*' => ['required', 'string', 'in:' . implode(',', InstitutionCleanupGroups::keys())],
            // Typing the institution's name back is the last gate, and it is the
            // institution's name rather than a word like DELETE for one reason:
            // the mistake this is guarding against is not "did not mean to run
            // it", it is "ran it against the wrong school".
            'confirmation' => ['required', 'string'],
        ], [
            'confirmation.required' => 'Type the institution name to confirm the clean-up.',
        ]);

        if (trim($validated['confirmation']) !== trim((string) $institution->title)) {
            return response()->json([
                'success' => false,
                'message' => 'Type the institution name exactly (' . $institution->title . ') to confirm the clean-up.',
            ], 422);
        }

        $user = $request->user();
        $role = $user && method_exists($user, 'getRole') ? $user->getRole() : null;

        $cleaner = new InstitutionDataCleaner($institution->id);
        $before = $cleaner->retainedPeople();

        try {
            $result = $cleaner->clear($validated['groups'], [
                'id' => $user?->id,
                'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: ($user->email ?? null),
                'role' => $role->slug ?? null,
            ]);
        } catch (RuntimeException $e) {
            // A guard refused: a surviving row would have been broken by the
            // run. Nothing was deleted.
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }

        $after = $cleaner->retainedPeople();

        // Worth a server-side trace independent of the audit table — this is the
        // largest irreversible action on the platform, and the people counts are
        // logged either side so the promise it makes is checkable in the logs
        // and not only in the response.
        Log::warning('Institution data cleaned up', [
            'institution_id' => $institution->id,
            'institution_title' => $institution->title,
            'groups' => $result['groups'],
            'total_deleted' => $result['total_deleted'],
            'students_before' => $before['students'],
            'students_after' => $after['students'],
            'staff_before' => $before['staff'],
            'staff_after' => $after['staff'],
            'cleared_by' => $user?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => $this->outcomeMessage($result, $institution->title, $after),
            'data' => array_merge($result, ['retained' => $after]),
        ]);
    }

    /**
     * Past clean-ups, newest first.
     *
     * Platform-wide rather than per-institution: the question this answers is
     * "what has been emptied lately", which is not a question about one school.
     */
    public function history(Request $request): JsonResponse
    {
        if ($refusal = $this->refuseUnlessSuperAdministrator($request)) {
            return $refusal;
        }

        $logs = InstitutionCleanupLog::query()
            ->with('institution:id,title')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (InstitutionCleanupLog $log) => [
                'id' => $log->id,
                'institution_id' => $log->institution_id,
                // Falls back rather than showing a dash: the institution row
                // survives a clean-up, but not necessarily a later deletion of
                // the tenant, and the entry still has to name what it emptied.
                'institution_title' => $log->institution?->title ?? 'Deleted institution',
                'groups' => $log->groups,
                'group_labels' => array_map(
                    fn (string $group) => InstitutionCleanupGroups::label($group),
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
     * @param  array{students: int, staff: int}  $retained
     */
    private function outcomeMessage(array $result, string $title, array $retained): string
    {
        $total = (int) $result['total_deleted'];

        if ($total === 0) {
            return 'Nothing to clean up — the selected groups held no records for ' . $title . '.';
        }

        $message = number_format($total) . ' ' . ($total === 1 ? 'record' : 'records')
            . ' deleted from ' . $title . '. '
            . number_format($retained['students']) . ' students and '
            . number_format($retained['staff']) . ' staff kept.';

        if (($result['files_failed'] ?? 0) > 0) {
            $message .= ' ' . number_format($result['files_failed'])
                . ' uploaded file(s) could not be removed from storage and are now orphaned.';
        }

        return $message;
    }

    /**
     * Refuse anyone who is not the super-administrator.
     *
     * Returns the refusal so the caller can `return` it, and null to continue —
     * a guard that has to be used to be useful, rather than a boolean that is
     * easy to call and ignore.
     */
    private function refuseUnlessSuperAdministrator(Request $request): ?JsonResponse
    {
        $user = $request->user();

        if (! $user || $user instanceof StudentPortalUser) {
            return $this->refusal();
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        if ((string) ($role->slug ?? '') !== 'super-administrator') {
            return $this->refusal();
        }

        return null;
    }

    private function refusal(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Only super-administrators can clean up an institution',
        ], 403);
    }

    private function unknownInstitution(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Institution not found',
        ], 404);
    }
}
