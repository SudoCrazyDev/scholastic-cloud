<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\TalaAccess;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Who at this school may chat with Tala.
 *
 * The administrator's side of the change that made Tala a per-teacher grant
 * rather than a role. Everything here is gated on `tala.configure`, the same
 * ability that sets the school's API key — one person, one screen, one answer to
 * "why can this teacher use Tala?".
 *
 * Only staff of the named institution can be granted. That is checked against
 * `user_institutions` rather than trusted from the request, so a crafted user id
 * cannot hand Tala to somebody at another school on this school's key.
 */
class TalaAccessController extends Controller
{
    use AuthorizesModuleAccess;

    /**
     * Every member of staff, and whether they hold Tala.
     *
     * The full roster rather than only the granted, because the screen's job is
     * choosing — an administrator cannot grant from a list of people who already
     * have it.
     */
    public function index(Request $request): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        $search = trim((string) $request->query('search', ''));

        $staff = User::query()
            ->whereHas('userInstitutions', fn ($q) => $q->where('institution_id', $institutionId))
            ->when($search !== '', fn ($q) => $q->where(fn ($inner) => $inner
                ->where('first_name', 'like', '%'.$search.'%')
                ->orWhere('last_name', 'like', '%'.$search.'%')
                ->orWhere('email', 'like', '%'.$search.'%')))
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->limit(500)
            ->get(['id', 'first_name', 'middle_name', 'last_name', 'email']);

        $access = TalaAccess::query()
            ->forInstitution($institutionId)
            ->with('grantedBy:id,first_name,last_name')
            ->get()
            ->keyBy('user_id');

        $rows = $staff->map(function (User $user) use ($access, $institutionId) {
            $grant = $access->get($user->id);

            return [
                'id' => $user->id,
                'name' => trim($user->first_name.' '.$user->last_name),
                'email' => $user->email,
                'role' => $user->roleForInstitution($institutionId)?->title,
                'granted' => (bool) $grant?->is_active,
                'granted_at' => $grant?->is_active ? $grant->granted_at : null,
                'granted_by' => $grant?->is_active ? $grant->toSummary()['granted_by'] : null,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $rows->values(),
            'meta' => [
                'granted_count' => $rows->where('granted', true)->count(),
                'staff_count' => $rows->count(),
            ],
        ]);
    }

    /**
     * Grant or revoke, one teacher or many.
     *
     * Takes a list rather than a single id because the realistic action is "give
     * it to this department" — and because a school arriving at this screen for
     * the first time has nobody granted at all and would otherwise be clicking
     * one row at a time.
     */
    public function update(Request $request): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        if ($response = $this->resolveStaff($request, $actor)) {
            return $response;
        }

        $validated = $request->validate([
            'user_ids' => ['required', 'array', 'min:1', 'max:500'],
            'user_ids.*' => ['required', 'string'],
            'granted' => ['required', 'boolean'],
        ]);

        // Membership is verified here rather than taken from the request: the
        // ids arrive from a browser, and granting Tala to somebody outside this
        // school would spend the school's key on a stranger.
        $eligible = User::query()
            ->whereIn('id', $validated['user_ids'])
            ->whereHas('userInstitutions', fn ($q) => $q->where('institution_id', $institutionId))
            ->pluck('id');

        if ($eligible->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'None of those staff belong to this institution.',
            ], 422);
        }

        $granting = (bool) $validated['granted'];

        DB::transaction(function () use ($eligible, $institutionId, $granting, $actor) {
            foreach ($eligible as $userId) {
                $access = TalaAccess::query()
                    ->forInstitution($institutionId)
                    ->where('user_id', $userId)
                    ->first()
                    ?? new TalaAccess([
                        'institution_id' => $institutionId,
                        'user_id' => $userId,
                    ]);

                $access->is_active = $granting;

                if ($granting) {
                    $access->granted_by = $actor->id;
                    $access->granted_at = now();
                    $access->revoked_by = null;
                    $access->revoked_at = null;
                } else {
                    $access->revoked_by = $actor->id;
                    $access->revoked_at = now();
                }

                $access->save();
            }
        });

        $skipped = count($validated['user_ids']) - $eligible->count();

        return response()->json([
            'success' => true,
            'message' => $this->describeOutcome($granting, $eligible->count(), $skipped),
            'data' => [
                'changed' => $eligible->count(),
                'skipped' => $skipped,
            ],
        ]);
    }

    private function describeOutcome(bool $granting, int $changed, int $skipped): string
    {
        $who = $changed === 1 ? '1 teacher' : $changed.' teachers';

        $message = $granting
            ? $who.' can now use Tala.'
            : 'Tala access removed for '.$who.'.';

        return $skipped === 0
            ? $message
            : $message.' '.$skipped.' were skipped — they do not belong to this institution.';
    }
}
