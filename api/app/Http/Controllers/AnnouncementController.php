<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Announcement;
use App\Models\AnnouncementAttachment;
use App\Models\AnnouncementGradeLevel;
use App\Models\AnnouncementRead;
use App\Models\ClassSection;
use App\Services\AnnouncementService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AnnouncementController extends Controller
{
    private const ADMIN_ROLES = ['super-administrator', 'principal', 'institution-administrator'];

    public function __construct(private readonly AnnouncementService $service)
    {
    }

    /* ===================== Authoring (teachers + admins) ===================== */

    /**
     * List announcements the current author can manage. Admins see every
     * announcement in their institution; teachers see only their own.
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

        $filters = $request->validate([
            'search' => 'nullable|string',
            'category' => 'nullable|in:all,general,finance',
            'status' => 'nullable|in:all,published,scheduled,draft,expired',
            'publish_from' => 'nullable|date',
            'publish_to' => 'nullable|date',
            'expires_from' => 'nullable|date',
            'expires_to' => 'nullable|date',
        ]);

        $query = Announcement::with(['sections', 'gradeLevels', 'attachments', 'author'])
            ->withCount('reads')
            ->where('institution_id', $institutionId);

        if (! $this->isAdmin($request)) {
            $query->where('author_id', $request->user()->id);
        }

        if ($request->filled('search')) {
            $query->where('title', 'like', '%'.$request->get('search').'%');
        }

        if (($filters['category'] ?? null) && $filters['category'] !== 'all') {
            $query->where('category', $filters['category']);
        }

        $this->applyStatusFilter($query, $filters['status'] ?? null);
        $this->applyDateRangeFilter($query, 'publish_at', $filters['publish_from'] ?? null, $filters['publish_to'] ?? null);
        $this->applyDateRangeFilter($query, 'expires_at', $filters['expires_from'] ?? null, $filters['expires_to'] ?? null);

        $announcements = $query
            ->orderByDesc('is_pinned')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $announcements->map(fn ($a) => $this->serialize($a))->values(),
        ]);
    }

    /**
     * Filter by the *computed* status shown in the manage list. "Scheduled" and
     * "expired" are not stored enum values — they are derived from publish_at /
     * expires_at relative to now, mirroring computedStatus() on the frontend and
     * the visibility rules in AnnouncementService (expired takes precedence over
     * scheduled). A null/"all" status applies no filter.
     */
    private function applyStatusFilter(Builder $query, ?string $status): void
    {
        if (! $status || $status === 'all') {
            return;
        }

        $now = now();

        match ($status) {
            'draft' => $query->where('status', 'draft'),
            'expired' => $query->where('status', 'published')
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', $now),
            'scheduled' => $query->where('status', 'published')
                ->whereNotNull('publish_at')
                ->where('publish_at', '>', $now)
                // Not already expired — expired wins over scheduled.
                ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', $now)),
            'published' => $query->where('status', 'published')
                ->where(fn (Builder $q) => $q->whereNull('publish_at')->orWhere('publish_at', '<=', $now))
                ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', $now)),
            default => null,
        };
    }

    /**
     * Bound a timestamp column to an inclusive [from, to] day range. Rows with a
     * null value in the column are excluded once either bound is set (there is
     * nothing to compare against) — matching the frontend range semantics.
     */
    private function applyDateRangeFilter(Builder $query, string $column, ?string $from, ?string $to): void
    {
        if ($from) {
            $query->whereNotNull($column)->where($column, '>=', Carbon::parse($from)->startOfDay());
        }
        if ($to) {
            $query->whereNotNull($column)->where($column, '<=', Carbon::parse($to)->endOfDay());
        }
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
        $resolved = $this->resolveTargeting($request, $institutionId, $validated);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }

        $user = $request->user();
        $announcement = DB::transaction(function () use ($validated, $resolved, $institutionId, $user) {
            $announcement = Announcement::create([
                'institution_id' => $institutionId,
                'author_id' => $user->id,
                'author_role' => $user->getRole()?->slug,
                'category' => $resolved['category'],
                'title' => $validated['title'],
                'body' => $validated['body'] ?? null,
                'audience' => $resolved['audience'],
                'scope' => $resolved['scope'],
                'is_pinned' => $validated['is_pinned'] ?? false,
                'status' => $validated['status'] ?? 'published',
                'publish_at' => $validated['publish_at'] ?? null,
                'expires_at' => $validated['expires_at'] ?? null,
            ]);

            $this->syncTargeting($announcement, $resolved);

            return $announcement;
        });

        return response()->json([
            'success' => true,
            'message' => 'Announcement created successfully',
            'data' => $this->serialize($this->loadFull($announcement)),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $announcement = $this->findManageable($request, $id);
        if ($announcement instanceof JsonResponse) {
            return $announcement;
        }

        return response()->json([
            'success' => true,
            'data' => $this->serialize($announcement),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $announcement = $this->findManageable($request, $id);
        if ($announcement instanceof JsonResponse) {
            return $announcement;
        }

        $validated = $this->validatePayload($request);
        $resolved = $this->resolveTargeting($request, $announcement->institution_id, $validated, $announcement->category);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }

        DB::transaction(function () use ($announcement, $validated, $resolved) {
            $announcement->update([
                'category' => $resolved['category'],
                'title' => $validated['title'],
                'body' => $validated['body'] ?? null,
                'audience' => $resolved['audience'],
                'scope' => $resolved['scope'],
                'is_pinned' => $validated['is_pinned'] ?? false,
                'status' => $validated['status'] ?? $announcement->status,
                'publish_at' => $validated['publish_at'] ?? null,
                'expires_at' => $validated['expires_at'] ?? null,
            ]);

            $this->syncTargeting($announcement, $resolved);
        });

        return response()->json([
            'success' => true,
            'message' => 'Announcement updated successfully',
            'data' => $this->serialize($this->loadFull($announcement)),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $announcement = $this->findManageable($request, $id);
        if ($announcement instanceof JsonResponse) {
            return $announcement;
        }

        // Remove stored attachment objects best-effort before deleting the row.
        foreach ($announcement->attachments as $attachment) {
            $this->deleteStoredFile($attachment->file_path);
        }

        $announcement->delete();

        return response()->json([
            'success' => true,
            'message' => 'Announcement deleted successfully',
        ]);
    }

    /* ===================== Attachments ===================== */

    public function uploadAttachment(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $announcement = $this->findManageable($request, $id);
        if ($announcement instanceof JsonResponse) {
            return $announcement;
        }

        $request->validate([
            'file' => 'required|file|max:102400|mimes:pdf,png,jpg,jpeg,gif,webp,doc,docx,ppt,pptx,xls,xlsx,txt,mp4,webm,mov,m4v,mp3,wav,m4a',
        ]);

        try {
            $file = $request->file('file');
            $extension = $file->getClientOriginalExtension() ?: 'bin';
            $fileName = Str::uuid().'.'.$extension;
            $path = $announcement->institution_id.'/announcements/'.$announcement->id.'/'.$fileName;

            Storage::disk('r2')->put($path, file_get_contents($file->getRealPath()));

            $attachment = $announcement->attachments()->create([
                'file_path' => $path,
                'file_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType() ?? $file->getClientMimeType(),
                'size' => $file->getSize(),
            ]);

            return response()->json([
                'success' => true,
                'data' => $this->serializeAttachment($attachment),
            ], 201);
        } catch (\Exception $e) {
            Log::error('Announcement attachment upload error:', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to upload attachment',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function deleteAttachment(Request $request, string $id, string $attachmentId): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $announcement = $this->findManageable($request, $id);
        if ($announcement instanceof JsonResponse) {
            return $announcement;
        }

        $attachment = $announcement->attachments()->where('id', $attachmentId)->first();
        if (! $attachment) {
            return response()->json(['success' => false, 'message' => 'Attachment not found'], 404);
        }

        $this->deleteStoredFile($attachment->file_path);
        $attachment->delete();

        return response()->json(['success' => true, 'message' => 'Attachment removed']);
    }

    /* ===================== Viewer feed (students + staff) ===================== */

    /**
     * The board feed for the current viewer (student or staff), annotated with
     * each announcement's read state for that viewer.
     */
    public function feed(Request $request): JsonResponse
    {
        $viewer = $this->service->resolveViewer($request);
        if (! $viewer) {
            return $this->noInstitution();
        }

        $announcements = $this->service->visibleQuery($viewer)
            ->with(['attachments', 'author'])
            ->get();

        $readIds = AnnouncementRead::where('reader_type', $viewer['kind'] === 'student' ? 'student' : 'user')
            ->where('reader_id', $viewer['student_id'] ?? $viewer['user_id'])
            ->whereIn('announcement_id', $announcements->pluck('id'))
            ->pluck('announcement_id')
            ->flip();

        return response()->json([
            'success' => true,
            'data' => $announcements
                ->map(fn ($a) => $this->serializeForViewer($a, $readIds->has($a->id)))
                ->values(),
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $viewer = $this->service->resolveViewer($request);
        if (! $viewer) {
            return response()->json(['success' => true, 'data' => ['count' => 0]]);
        }

        $readerType = $viewer['kind'] === 'student' ? 'student' : 'user';
        $readerId = $viewer['student_id'] ?? $viewer['user_id'];

        $count = $this->service->visibleQuery($viewer)
            ->whereDoesntHave('reads', function ($q) use ($readerType, $readerId) {
                $q->where('reader_type', $readerType)->where('reader_id', $readerId);
            })
            ->count();

        return response()->json(['success' => true, 'data' => ['count' => $count]]);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        $viewer = $this->service->resolveViewer($request);
        if (! $viewer) {
            return $this->noInstitution();
        }

        // Only allow marking announcements the viewer can actually see.
        $visible = $this->service->visibleQuery($viewer)->where('announcements.id', $id)->exists();
        if (! $visible) {
            return response()->json(['success' => false, 'message' => 'Announcement not found'], 404);
        }

        $readerType = $viewer['kind'] === 'student' ? 'student' : 'user';
        $readerId = $viewer['student_id'] ?? $viewer['user_id'];

        AnnouncementRead::updateOrCreate(
            ['announcement_id' => $id, 'reader_type' => $readerType, 'reader_id' => $readerId],
            ['read_at' => now()],
        );

        return response()->json(['success' => true, 'message' => 'Marked as read']);
    }

    /* ===================== Helpers ===================== */

    /**
     * Validate the shared create/update payload. Targeting validity (ownership,
     * institution membership) is handled separately in resolveTargeting().
     */
    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'nullable|string',
            'category' => 'nullable|in:general,finance',
            'audience' => 'required|in:students,teachers,both',
            'scope' => 'required|in:institution,grade_levels,sections',
            'is_pinned' => 'nullable|boolean',
            'status' => 'nullable|in:draft,published',
            'publish_at' => 'nullable|date',
            'expires_at' => 'nullable|date',
            'section_ids' => 'array',
            'section_ids.*' => 'uuid',
            'grade_levels' => 'array',
            'grade_levels.*' => 'string',
        ]);
    }

    /**
     * Apply role-based targeting rules and return the resolved category/audience/
     * scope/section_ids/grade_levels, or a JsonResponse error when the request is
     * not allowed.
     *
     * @return array{category:string,audience:string,scope:string,section_ids:array,grade_levels:array}|JsonResponse
     */
    private function resolveTargeting(Request $request, string $institutionId, array $validated, ?string $currentCategory = null)
    {
        $isAdmin = $this->isAdmin($request);
        $user = $request->user();

        // Finance staff always author finance announcements; admins keep an
        // existing announcement's category unless the payload changes it.
        // Teachers can never author finance posts (it would grant them an
        // institution-wide audience).
        if ($this->isFinance($request)) {
            $category = 'finance';
        } elseif ($isAdmin) {
            $category = $validated['category'] ?? $currentCategory ?? 'general';
        } else {
            $category = 'general';
        }

        if ($category === 'finance') {
            // Finance announcements are always for every student.
            $audience = 'students';
            $scope = 'institution';
        } elseif ($isAdmin) {
            $audience = $validated['audience'];
            $scope = $validated['scope'];
        } else {
            // Teachers may only post to the students of their own sections.
            $audience = 'students';
            $scope = 'sections';
        }

        $sectionIds = [];
        $gradeLevels = [];

        if ($scope === 'sections') {
            $requested = $validated['section_ids'] ?? [];
            if (empty($requested)) {
                return $this->validationError('Select at least one section for a section-targeted announcement.');
            }

            // Sections must belong to the institution...
            $validIds = ClassSection::where('institution_id', $institutionId)
                ->whereIn('id', $requested)
                ->pluck('id')
                ->all();

            // ...and, for teachers, must be sections they advise or teach.
            if (! $isAdmin) {
                $ownSectionIds = $this->service->staffSectionIds($user, $institutionId);
                $validIds = array_values(array_intersect($validIds, $ownSectionIds));
                if (empty($validIds)) {
                    return $this->validationError('You can only post to sections you advise or teach.');
                }
            }

            if (empty($validIds)) {
                return $this->validationError('The selected sections are not valid for this institution.');
            }

            $sectionIds = $validIds;
        } elseif ($scope === 'grade_levels') {
            $gradeLevels = array_values(array_unique(array_filter($validated['grade_levels'] ?? [])));
            if (empty($gradeLevels)) {
                return $this->validationError('Select at least one grade level for a grade-targeted announcement.');
            }
        }

        return [
            'category' => $category,
            'audience' => $audience,
            'scope' => $scope,
            'section_ids' => $sectionIds,
            'grade_levels' => $gradeLevels,
        ];
    }

    private function syncTargeting(Announcement $announcement, array $resolved): void
    {
        // Sections (pivot) — full replace.
        $announcement->sections()->sync($resolved['scope'] === 'sections' ? $resolved['section_ids'] : []);

        // Grade levels — full replace.
        AnnouncementGradeLevel::where('announcement_id', $announcement->id)->delete();
        if ($resolved['scope'] === 'grade_levels') {
            foreach ($resolved['grade_levels'] as $gradeLevel) {
                $announcement->gradeLevels()->create(['grade_level' => $gradeLevel]);
            }
        }
    }

    /**
     * Find an announcement the current author may manage, or a JsonResponse error.
     *
     * @return Announcement|JsonResponse
     */
    private function findManageable(Request $request, string $id)
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $query = Announcement::with(['sections', 'gradeLevels', 'attachments', 'author'])
            ->withCount('reads')
            ->where('institution_id', $institutionId);

        if (! $this->isAdmin($request)) {
            $query->where('author_id', $request->user()->id);
        }

        $announcement = $query->find($id);
        if (! $announcement) {
            return $this->notFound();
        }

        return $announcement;
    }

    private function loadFull(Announcement $announcement): Announcement
    {
        return $announcement->fresh(['sections', 'gradeLevels', 'attachments', 'author'])
            ->loadCount('reads');
    }

    private function serialize(Announcement $a): array
    {
        return [
            'id' => $a->id,
            'institution_id' => $a->institution_id,
            'title' => $a->title,
            'body' => $a->body,
            'category' => $a->category,
            'audience' => $a->audience,
            'scope' => $a->scope,
            'is_pinned' => (bool) $a->is_pinned,
            'status' => $a->status,
            'publish_at' => $a->publish_at?->toIso8601String(),
            'expires_at' => $a->expires_at?->toIso8601String(),
            'author_id' => $a->author_id,
            'author_role' => $a->author_role,
            'author_name' => $this->authorName($a),
            'read_count' => (int) ($a->reads_count ?? 0),
            'section_ids' => $a->sections->pluck('id')->values(),
            'sections' => $a->sections->map(fn ($s) => [
                'id' => $s->id,
                'title' => $s->title,
                'grade_level' => $s->grade_level,
            ])->values(),
            'grade_levels' => $a->gradeLevels->pluck('grade_level')->values(),
            'attachments' => $a->attachments->map(fn ($att) => $this->serializeAttachment($att))->values(),
            'created_at' => $a->created_at?->toIso8601String(),
            'updated_at' => $a->updated_at?->toIso8601String(),
        ];
    }

    private function serializeForViewer(Announcement $a, bool $isRead): array
    {
        return [
            'id' => $a->id,
            'title' => $a->title,
            'body' => $a->body,
            'is_pinned' => (bool) $a->is_pinned,
            'audience' => $a->audience,
            'author_role' => $a->author_role,
            'author_name' => $this->authorName($a),
            'is_read' => $isRead,
            'publish_at' => $a->publish_at?->toIso8601String(),
            'attachments' => $a->attachments->map(fn ($att) => $this->serializeAttachment($att))->values(),
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }

    private function serializeAttachment(AnnouncementAttachment $attachment): array
    {
        return [
            'id' => $attachment->id,
            'name' => $attachment->file_name,
            'mime' => $attachment->mime_type,
            'size' => $attachment->size,
            'url' => $this->temporaryFileUrl($attachment->file_path),
        ];
    }

    private function authorName(Announcement $a): string
    {
        $author = $a->author;
        if (! $author) {
            return 'Unknown';
        }

        $name = trim(($author->first_name ?? '').' '.($author->last_name ?? ''));

        return $name !== '' ? $name : ($author->email ?? 'Unknown');
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $institutionId = $user->userInstitutions()->value('institution_id');
        }

        return $institutionId;
    }

    private function isAdmin(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return in_array((string) ($role->slug ?? ''), self::ADMIN_ROLES, true);
    }

    private function isFinance(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'finance';
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

    private function temporaryFileUrl(string $path): ?string
    {
        try {
            return Storage::disk('r2')->temporaryUrl($path, now()->addDays(7));
        } catch (\Throwable) {
            try {
                return Storage::disk('r2')->url($path);
            } catch (\Throwable) {
                return null;
            }
        }
    }

    private function deleteStoredFile(?string $path): void
    {
        if (! $path) {
            return;
        }
        try {
            Storage::disk('r2')->delete($path);
        } catch (\Throwable $e) {
            Log::warning('Failed to delete announcement attachment object', ['path' => $path, 'error' => $e->getMessage()]);
        }
    }

    private function studentForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Students are not allowed to manage announcements',
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
            'message' => 'Announcement not found',
        ], 404);
    }

    private function validationError(string $message): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 422);
    }
}
