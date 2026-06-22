<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\StaffCalendarEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StaffCalendarEventController extends Controller
{
    /**
     * List calendar events, optionally within a date range (from/to).
     */
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $query = StaffCalendarEvent::where('institution_id', $institutionId);

        if ($request->filled('from')) {
            $query->whereDate('event_date', '>=', $request->get('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('event_date', '<=', $request->get('to'));
        }
        if ($request->filled('type')) {
            $query->where('type', $request->get('type'));
        }

        $events = $query->orderBy('event_date')->orderBy('title')->get();

        return response()->json([
            'success' => true,
            'data' => $events->map(fn ($event) => $this->serialize($event))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $this->validatePayload($request);

        $event = StaffCalendarEvent::create([
            'institution_id' => $institutionId,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'type' => $validated['type'],
            'event_date' => $validated['event_date'],
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Calendar entry created successfully',
            'data' => $this->serialize($event),
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $event = StaffCalendarEvent::where('institution_id', $institutionId)->find($id);
        if (! $event) {
            return $this->notFound();
        }

        $validated = $this->validatePayload($request);

        $event->update([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'type' => $validated['type'],
            'event_date' => $validated['event_date'],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Calendar entry updated successfully',
            'data' => $this->serialize($event),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $event = StaffCalendarEvent::where('institution_id', $institutionId)->find($id);
        if (! $event) {
            return $this->notFound();
        }

        $event->delete();

        return response()->json([
            'success' => true,
            'message' => 'Calendar entry deleted successfully',
        ]);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => ['required', Rule::in(StaffCalendarEvent::TYPES)],
            'event_date' => 'required|date',
        ]);
    }

    private function serialize(StaffCalendarEvent $event): array
    {
        return [
            'id' => $event->id,
            'institution_id' => $event->institution_id,
            'title' => $event->title,
            'description' => $event->description,
            'type' => $event->type,
            'event_date' => $event->event_date?->format('Y-m-d'),
            'created_at' => $event->created_at?->toIso8601String(),
            'updated_at' => $event->updated_at?->toIso8601String(),
        ];
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

    private function isStudentUser(Request $request): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }

        if ($user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'student';
    }

    private function studentForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Students are not allowed to manage the staff calendar',
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
            'message' => 'Calendar entry not found',
        ], 404);
    }
}
