<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\TalaConversation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A teacher's own chat threads.
 *
 * Every query here is scoped to the signed-in user, not to their institution.
 * There is deliberately no endpoint for reading someone else's conversations —
 * an administrator holding `tala.configure` sets the school's key and sees
 * usage counts, and that is the whole of their visibility.
 */
class TalaConversationController extends Controller
{
    use AuthorizesModuleAccess;

    public function index(Request $request): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }

        $conversations = TalaConversation::query()
            ->where('institution_id', $institutionId)
            ->ownedBy($user->id)
            ->active()
            ->orderByDesc('last_message_at')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get(['id', 'title', 'provider', 'model', 'last_message_at', 'created_at']);

        return response()->json([
            'success' => true,
            'data' => $conversations,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }

        $validated = $request->validate([
            'title' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        $conversation = TalaConversation::create([
            'institution_id' => $institutionId,
            'user_id' => $user->id,
            'title' => $validated['title'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'data' => $conversation,
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $conversation = $this->findOwned($request, $id);

        if (! $conversation) {
            return $this->missing();
        }

        return response()->json([
            'success' => true,
            'data' => [
                'conversation' => $conversation->only([
                    'id', 'title', 'provider', 'model', 'last_message_at', 'created_at',
                ]),
                'messages' => $conversation->messages()->get([
                    'id', 'role', 'content', 'provider', 'model',
                    'error_message', 'created_at',
                ]),
            ],
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $conversation = $this->findOwned($request, $id);

        if (! $conversation) {
            return $this->missing();
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:120'],
        ]);

        $conversation->update(['title' => $validated['title']]);

        return response()->json([
            'success' => true,
            'data' => $conversation,
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $conversation = $this->findOwned($request, $id);

        if (! $conversation) {
            return $this->missing();
        }

        // A real delete: the messages cascade with it. A teacher deleting a
        // chat means it should be gone, and there is no institutional interest
        // in a tombstone of what they asked.
        $conversation->delete();

        return response()->json([
            'success' => true,
            'message' => 'Conversation deleted.',
        ]);
    }

    /**
     * Scoped by owner, so someone else's conversation id reads as missing
     * rather than forbidden — no confirming an id exists to a stranger.
     */
    private function findOwned(Request $request, string $id): ?TalaConversation
    {
        $user = $this->staffUser($request);

        if (! $user) {
            return null;
        }

        return TalaConversation::query()->ownedBy($user->id)->find($id);
    }

    private function missing(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Conversation not found',
        ], 404);
    }
}
