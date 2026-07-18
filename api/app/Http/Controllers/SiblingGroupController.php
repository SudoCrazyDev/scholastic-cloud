<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\SiblingGroup;
use App\Models\SiblingGroupMember;
use App\Models\StudentDiscount;
use App\Auth\StudentPortalUser;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SiblingGroupController extends Controller
{
    /** Roles allowed to create/edit sibling groups and memberships. */
    private const MANAGE_ROLES = ['finance', 'institution-administrator', 'principal', 'super-administrator'];

    /** Roles allowed to apply a sibling discount to a student's account. */
    private const APPLY_ROLES = ['finance', 'institution-administrator', 'principal', 'super-administrator'];

    /**
     * List sibling groups for the institution. When academic_year is given,
     * each group also carries its non-voided sibling discounts for that year
     * so the UI can show per-member applied state.
     */
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access sibling group endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'academic_year' => 'nullable|string|max:255',
            'search' => 'nullable|string|max:255',
        ]);

        $query = SiblingGroup::with(['members.student'])
            ->where('institution_id', $institutionId);

        if (!empty($validated['academic_year'])) {
            $year = $validated['academic_year'];
            $query->with(['discounts' => function ($q) use ($year) {
                $q->where('academic_year', $year)->whereNull('voided_at');
            }]);
        }

        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhereHas('members.student', function ($sq) use ($search) {
                        $sq->where('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('lrn', 'like', "%{$search}%");
                    });
            });
        }

        $groups = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $groups
        ]);
    }

    /**
     * Return the sibling group (with members) that a student belongs to,
     * or null when the student is not in any group.
     */
    public function showForStudent(Request $request, string $studentId): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access sibling group endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($studentId);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution'
            ], 404);
        }

        $membership = SiblingGroupMember::where('student_id', $student->id)->first();
        if (!$membership) {
            return response()->json([
                'success' => true,
                'data' => null
            ]);
        }

        $group = SiblingGroup::with(['members.student'])->find($membership->sibling_group_id);

        return response()->json([
            'success' => true,
            'data' => $group
        ]);
    }

    /**
     * Create a sibling group from two or more students.
     */
    public function store(Request $request): JsonResponse
    {
        if (!$this->hasRole($request, self::MANAGE_ROLES)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to manage sibling groups'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'name' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'student_ids' => 'required|array|min:2',
            'student_ids.*' => 'required|uuid|distinct|exists:students,id',
        ]);

        $studentIds = $validated['student_ids'];

        $error = $this->validateLinkableStudents($studentIds, $institutionId);
        if ($error) {
            return $error;
        }

        $group = DB::transaction(function () use ($validated, $studentIds, $institutionId, $request) {
            $group = SiblingGroup::create([
                'institution_id' => $institutionId,
                'name' => $validated['name'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'created_by' => $request->user()?->id,
            ]);

            foreach ($studentIds as $studentId) {
                SiblingGroupMember::create([
                    'sibling_group_id' => $group->id,
                    'student_id' => $studentId,
                    'added_by' => $request->user()?->id,
                ]);
            }

            return $group;
        });

        $group->load(['members.student']);

        return response()->json([
            'success' => true,
            'message' => 'Sibling group created successfully',
            'data' => $group
        ], 201);
    }

    /**
     * Add a student to an existing sibling group.
     */
    public function addMember(Request $request, string $groupId): JsonResponse
    {
        if (!$this->hasRole($request, self::MANAGE_ROLES)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to manage sibling groups'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $group = SiblingGroup::where('institution_id', $institutionId)->find($groupId);
        if (!$group) {
            return response()->json([
                'success' => false,
                'message' => 'Sibling group not found'
            ], 404);
        }

        $validated = $request->validate([
            'student_id' => 'required|uuid|exists:students,id',
        ]);

        $error = $this->validateLinkableStudents([$validated['student_id']], $institutionId);
        if ($error) {
            return $error;
        }

        $member = SiblingGroupMember::create([
            'sibling_group_id' => $group->id,
            'student_id' => $validated['student_id'],
            'added_by' => $request->user()?->id,
        ]);

        $member->load('student');

        return response()->json([
            'success' => true,
            'message' => 'Sibling added successfully',
            'data' => $member
        ], 201);
    }

    /**
     * Update a member's intended discount. Never touches discounts that were
     * already applied; those only change through the void + re-apply flow.
     */
    public function updateMember(Request $request, string $groupId, string $memberId): JsonResponse
    {
        if (!$this->hasRole($request, self::MANAGE_ROLES)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to manage sibling groups'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $member = $this->findMember($institutionId, $groupId, $memberId);
        if (!$member) {
            return response()->json([
                'success' => false,
                'message' => 'Sibling group member not found'
            ], 404);
        }

        $validated = $request->validate([
            'discount_type' => ['nullable', Rule::in(['fixed', 'percentage'])],
            'discount_value' => 'nullable|numeric|min:0|required_with:discount_type',
        ]);

        $type = $validated['discount_type'] ?? null;
        $value = $validated['discount_value'] ?? null;

        if (($type === null) !== ($value === null)) {
            return response()->json([
                'success' => false,
                'message' => 'Discount type and value must be provided together.'
            ], 422);
        }

        if ($type === 'percentage' && $value > 100) {
            return response()->json([
                'success' => false,
                'message' => 'Percentage discount cannot exceed 100.'
            ], 422);
        }

        $member->update([
            'discount_type' => $type,
            'discount_value' => $value,
        ]);

        $member->load('student');

        return response()->json([
            'success' => true,
            'message' => 'Sibling discount updated successfully',
            'data' => $member
        ]);
    }

    /**
     * Remove a student from a sibling group. Applied discounts are left
     * untouched (void is the reversal path). Deletes the group when the
     * last member is removed.
     */
    public function removeMember(Request $request, string $groupId, string $memberId): JsonResponse
    {
        if (!$this->hasRole($request, self::MANAGE_ROLES)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to manage sibling groups'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $member = $this->findMember($institutionId, $groupId, $memberId);
        if (!$member) {
            return response()->json([
                'success' => false,
                'message' => 'Sibling group member not found'
            ], 404);
        }

        $member->delete();

        $remaining = SiblingGroupMember::where('sibling_group_id', $groupId)->count();
        if ($remaining === 0) {
            SiblingGroup::where('id', $groupId)->delete();
        }

        return response()->json([
            'success' => true,
            'message' => 'Sibling removed successfully',
            'data' => ['remaining_members' => $remaining]
        ]);
    }

    /**
     * Apply a member's sibling discount for an academic year by creating a
     * student_discounts row. The existing ledger/installment pipeline picks
     * it up automatically; reversal is the existing discount void flow.
     */
    public function applyDiscount(Request $request, string $groupId, string $memberId): JsonResponse
    {
        if (!$this->hasRole($request, self::APPLY_ROLES)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to apply sibling discounts'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $member = $this->findMember($institutionId, $groupId, $memberId);
        if (!$member) {
            return response()->json([
                'success' => false,
                'message' => 'Sibling group member not found'
            ], 404);
        }

        $validated = $request->validate([
            'academic_year' => 'required|string|max:255',
            'discount_type' => ['nullable', Rule::in(['fixed', 'percentage'])],
            'value' => 'nullable|numeric|min:0|required_with:discount_type',
        ]);

        $type = $validated['discount_type'] ?? $member->discount_type;
        $value = $validated['value'] ?? $member->discount_value;

        if ($type === null || $value === null) {
            return response()->json([
                'success' => false,
                'message' => 'This sibling has no discount set. Set an intended discount first or pass an override.'
            ], 422);
        }

        if ($type === 'percentage' && $value > 100) {
            return response()->json([
                'success' => false,
                'message' => 'Percentage discount cannot exceed 100.'
            ], 422);
        }

        $alreadyApplied = StudentDiscount::where('student_id', $member->student_id)
            ->where('academic_year', $validated['academic_year'])
            ->where('sibling_group_id', $groupId)
            ->whereNull('voided_at')
            ->exists();

        if ($alreadyApplied) {
            return response()->json([
                'success' => false,
                'message' => 'A sibling discount is already applied for this academic year. Void it first to re-apply.'
            ], 422);
        }

        $group = $member->group;

        $discount = StudentDiscount::create([
            'institution_id' => $institutionId,
            'student_id' => $member->student_id,
            'school_fee_id' => null,
            'sibling_group_id' => $groupId,
            'academic_year' => $validated['academic_year'],
            'discount_type' => $type,
            'value' => $value,
            'description' => 'Sibling discount — ' . ($group->name ?: 'Sibling group'),
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Sibling discount applied successfully',
            'data' => $discount
        ], 201);
    }

    /**
     * Dissolve a sibling group. Members cascade-delete; applied discounts
     * survive (their sibling_group_id is set null by the FK).
     */
    public function destroy(Request $request, string $groupId): JsonResponse
    {
        if (!$this->hasRole($request, self::MANAGE_ROLES)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to manage sibling groups'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $group = SiblingGroup::where('institution_id', $institutionId)->find($groupId);
        if (!$group) {
            return response()->json([
                'success' => false,
                'message' => 'Sibling group not found'
            ], 404);
        }

        $group->delete();

        return response()->json([
            'success' => true,
            'message' => 'Sibling group deleted successfully'
        ]);
    }

    /**
     * Ensure every student belongs to the institution and is not already in
     * a sibling group. Returns an error response, or null when all pass.
     */
    private function validateLinkableStudents(array $studentIds, string $institutionId): ?JsonResponse
    {
        $students = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->whereIn('id', $studentIds)->get()->keyBy('id');

        foreach ($studentIds as $studentId) {
            if (!$students->has($studentId)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Student not found in this institution'
                ], 404);
            }
        }

        $existing = SiblingGroupMember::with('student')
            ->whereIn('student_id', $studentIds)
            ->first();

        if ($existing) {
            $name = trim(($existing->student->first_name ?? '') . ' ' . ($existing->student->last_name ?? ''));
            return response()->json([
                'success' => false,
                'message' => ($name !== '' ? $name : 'A selected student') . ' is already in another sibling group. Remove them from that group first.'
            ], 422);
        }

        return null;
    }

    private function findMember(string $institutionId, string $groupId, string $memberId): ?SiblingGroupMember
    {
        return SiblingGroupMember::where('id', $memberId)
            ->where('sibling_group_id', $groupId)
            ->whereHas('group', function ($query) use ($institutionId) {
                $query->where('institution_id', $institutionId);
            })
            ->first();
    }

    private function hasRole(Request $request, array $roles): bool
    {
        $user = $request->user();
        if (!$user || $user instanceof StudentPortalUser) {
            return false;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return in_array((string) ($role->slug ?? ''), $roles, true);
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
