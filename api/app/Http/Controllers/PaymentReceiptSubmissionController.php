<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PaymentReceiptSubmission;
use App\Models\Student;
use App\Models\StudentPayment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PaymentReceiptSubmissionController extends Controller
{
    /** Roles that may review (approve/reject) uploaded receipts. */
    private const REVIEWER_ROLES = ['finance', 'institution-administrator', 'principal', 'super-administrator'];

    /**
     * List receipt submissions.
     *
     * Students see only their own (any status). Reviewer roles see the
     * institution queue, filterable by status / academic year / student.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => 'nullable|in:pending,approved,rejected',
            'academic_year' => 'nullable|string|max:255',
            'student_id' => 'nullable|uuid|exists:students,id',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $query = PaymentReceiptSubmission::query()
            ->with([
                'student:id,first_name,middle_name,last_name',
                'reviewer:id,first_name,last_name',
            ])
            ->where('institution_id', $institutionId);

        if ($this->isStudentActor($request)) {
            $studentId = $this->resolveSelfStudentId($request);
            if (!$studentId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Student record not found for this account',
                ], 403);
            }
            $query->where('student_id', $studentId);
        } else {
            if (!$this->canReview($request)) {
                return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
            }
            if (!empty($filters['student_id'])) {
                $query->where('student_id', $filters['student_id']);
            }
        }

        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (!empty($filters['academic_year'])) {
            $query->where('academic_year', $filters['academic_year']);
        }

        $submissions = $query->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $submissions,
        ]);
    }

    /**
     * Student uploads a proof-of-payment receipt for an installment (status = pending).
     */
    public function store(Request $request): JsonResponse
    {
        if (!$this->isStudentActor($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Only students can upload payment receipts.',
            ], 403);
        }

        $validated = $request->validate([
            'academic_year' => 'required|string|max:255',
            'installment_sequence' => 'required|integer|min:1',
            'installment_label' => 'nullable|string|max:255',
            'file' => 'required|file|mimes:png,jpg,jpeg,webp,pdf|max:10240',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $studentId = $this->resolveSelfStudentId($request);
        if (!$studentId) {
            return response()->json([
                'success' => false,
                'message' => 'Student record not found for this account',
            ], 403);
        }

        // One pending submission per installment at a time.
        $existingPending = PaymentReceiptSubmission::where('student_id', $studentId)
            ->where('academic_year', $validated['academic_year'])
            ->where('installment_sequence', $validated['installment_sequence'])
            ->where('status', PaymentReceiptSubmission::STATUS_PENDING)
            ->exists();

        if ($existingPending) {
            return response()->json([
                'success' => false,
                'message' => 'A receipt for this installment is already pending review.',
            ], 422);
        }

        $file = $request->file('file');
        $extension = $file->getClientOriginalExtension() ?: 'jpg';
        $fileName = Str::uuid() . '.' . $extension;
        $r2Path = $institutionId . '/student/' . $studentId . '/payment-receipts/' . $fileName;

        Storage::disk('r2')->put($r2Path, file_get_contents($file->getRealPath()));

        $submission = PaymentReceiptSubmission::create([
            'institution_id' => $institutionId,
            'student_id' => $studentId,
            'academic_year' => $validated['academic_year'],
            'installment_sequence' => $validated['installment_sequence'],
            'installment_label' => $validated['installment_label'] ?? null,
            'file_path' => $r2Path,
            'file_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType() ?? $file->getClientMimeType(),
            'status' => PaymentReceiptSubmission::STATUS_PENDING,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Receipt uploaded. It will be reviewed by the finance office.',
            'data' => $submission,
        ], 201);
    }

    /**
     * Approve a pending submission: staff enters the verified amount and the
     * payment is posted to the student's ledger.
     */
    public function approve(Request $request, string $id): JsonResponse
    {
        if (!$this->canReview($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        $submission = PaymentReceiptSubmission::where('institution_id', $institutionId)->find($id);

        if (!$submission) {
            return response()->json(['success' => false, 'message' => 'Receipt submission not found.'], 404);
        }
        if ($submission->status !== PaymentReceiptSubmission::STATUS_PENDING) {
            return response()->json(['success' => false, 'message' => 'Only pending submissions can be approved.'], 422);
        }

        $userId = $request->user()?->id;

        DB::transaction(function () use ($submission, $validated, $userId) {
            $label = $submission->installment_label
                ?: 'Installment #' . $submission->installment_sequence;

            $payment = StudentPayment::create([
                'institution_id' => $submission->institution_id,
                'student_id' => $submission->student_id,
                'school_fee_id' => null,
                'academic_year' => $submission->academic_year,
                'amount' => $validated['amount'],
                'payment_date' => now()->toDateString(),
                'payment_method' => 'Online - Receipt Upload',
                'reference_number' => null,
                'receipt_number' => StudentPayment::generateUniqueReceiptNumber(),
                'remarks' => 'Posted from verified online payment receipt (' . $label . ')',
                'received_by' => $userId,
            ]);

            $submission->update([
                'status' => PaymentReceiptSubmission::STATUS_APPROVED,
                'amount' => $validated['amount'],
                'student_payment_id' => $payment->id,
                'reviewed_by' => $userId,
                'reviewed_at' => now(),
            ]);
        });

        $submission->load([
            'student:id,first_name,middle_name,last_name',
            'reviewer:id,first_name,last_name',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Receipt approved. Payment posted to the student ledger.',
            'data' => $submission,
        ]);
    }

    /**
     * Reject a pending submission with a required reason.
     */
    public function reject(Request $request, string $id): JsonResponse
    {
        if (!$this->canReview($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'review_note' => 'required|string|max:2000',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        $submission = PaymentReceiptSubmission::where('institution_id', $institutionId)->find($id);

        if (!$submission) {
            return response()->json(['success' => false, 'message' => 'Receipt submission not found.'], 404);
        }
        if ($submission->status !== PaymentReceiptSubmission::STATUS_PENDING) {
            return response()->json(['success' => false, 'message' => 'Only pending submissions can be rejected.'], 422);
        }

        $submission->update([
            'status' => PaymentReceiptSubmission::STATUS_REJECTED,
            'review_note' => $validated['review_note'],
            'reviewed_by' => $request->user()?->id,
            'reviewed_at' => now(),
        ]);

        $submission->load([
            'student:id,first_name,middle_name,last_name',
            'reviewer:id,first_name,last_name',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Receipt rejected.',
            'data' => $submission,
        ]);
    }

    private function canReview(Request $request): bool
    {
        $user = $request->user();
        if (!$user || $user instanceof StudentPortalUser) {
            return false;
        }

        $slug = method_exists($user, 'getRole') ? $user->getRole()?->slug : null;

        return $slug !== null && in_array($slug, self::REVIEWER_ROLES, true);
    }

    private function isStudentActor(Request $request): bool
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

    private function resolveSelfStudentId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student->id;
        }

        return Student::where('user_id', $user->id)->value('id');
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student
                ->studentInstitutions()
                ->where('is_active', true)
                ->value('institution_id')
                ?? $user->student->studentInstitutions()->value('institution_id');
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        if (!$institutionId && $this->isStudentActor($request)) {
            $selfStudentId = $this->resolveSelfStudentId($request);
            if ($selfStudentId) {
                $selfStudent = Student::find($selfStudentId);
                $institutionId = $selfStudent?->studentInstitutions()->value('institution_id');
            }
        }

        return $institutionId;
    }
}
