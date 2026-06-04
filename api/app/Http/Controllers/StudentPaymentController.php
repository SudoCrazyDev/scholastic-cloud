<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\SchoolFee;
use App\Models\StudentPayment;
use App\Models\PaymentTransaction;
use App\Auth\StudentPortalUser;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class StudentPaymentController extends Controller
{
    /**
     * Display a listing of student payments.
     */
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access cashier payment endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validator = Validator::make($request->all(), [
            'student_id' => 'required|uuid|exists:students,id',
            'academic_year' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $studentId = $request->get('student_id');
        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($studentId);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution'
            ], 404);
        }

        $query = StudentPayment::with(['schoolFee'])
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId);

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->get('academic_year'));
        }

        $payments = $query->orderBy('payment_date', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $payments
        ]);
    }

    /**
     * Store a newly created student payment.
     */
    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to record payments manually'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        // Multi-fee transaction path: a single transaction settles several fees.
        if ($request->has('items')) {
            return $this->storeTransaction($request, $institutionId);
        }

        $validated = $request->validate([
            'student_id' => 'required|uuid|exists:students,id',
            'academic_year' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'nullable|date',
            'payment_method' => 'nullable|string|max:255',
            'reference_number' => 'nullable|string|max:255',
            'remarks' => 'nullable|string',
            'school_fee_id' => 'nullable|uuid|exists:school_fees,id',
        ]);

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($validated['student_id']);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution'
            ], 404);
        }

        if (!empty($validated['school_fee_id'])) {
            $schoolFee = SchoolFee::where('institution_id', $institutionId)
                ->where('id', $validated['school_fee_id'])
                ->first();

            if (!$schoolFee) {
                return response()->json([
                    'success' => false,
                    'message' => 'School fee not found for this institution'
                ], 404);
            }
        }

        $payment = StudentPayment::create([
            'institution_id' => $institutionId,
            'student_id' => $validated['student_id'],
            'school_fee_id' => $validated['school_fee_id'] ?? null,
            'academic_year' => $validated['academic_year'],
            'amount' => $validated['amount'],
            'payment_date' => $validated['payment_date'] ?? now()->toDateString(),
            'payment_method' => $validated['payment_method'] ?? null,
            'reference_number' => $validated['reference_number'] ?? null,
            'receipt_number' => PaymentTransaction::generateUniqueReceiptNumber(),
            'remarks' => $validated['remarks'] ?? null,
            'received_by' => $request->user()?->id,
        ]);

        $payment->load(['schoolFee', 'student']);

        return response()->json([
            'success' => true,
            'message' => 'Payment recorded successfully',
            'data' => $payment
        ], 201);
    }

    /**
     * Store a multi-fee payment as a single transaction (header + line items).
     */
    private function storeTransaction(Request $request, string $institutionId): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => 'required|uuid|exists:students,id',
            'academic_year' => 'required|string|max:255',
            'payment_date' => 'nullable|date',
            'payment_method' => 'nullable|string|max:255',
            'reference_number' => 'nullable|string|max:255',
            'or_number' => 'nullable|string|max:255',
            'remarks' => 'nullable|string',
            'amount_tendered' => 'nullable|numeric|min:0',
            'items' => 'required|array|min:1',
            'items.*.school_fee_id' => 'nullable|uuid|exists:school_fees,id',
            'items.*.amount' => 'required|numeric|min:0.01',
            'items.*.remarks' => 'nullable|string',
        ]);

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($validated['student_id']);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution'
            ], 404);
        }

        // Validate every referenced fee belongs to this institution.
        $feeIds = collect($validated['items'])
            ->pluck('school_fee_id')
            ->filter()
            ->unique()
            ->values();

        if ($feeIds->isNotEmpty()) {
            $foundCount = SchoolFee::where('institution_id', $institutionId)
                ->whereIn('id', $feeIds)
                ->count();

            if ($foundCount !== $feeIds->count()) {
                return response()->json([
                    'success' => false,
                    'message' => 'One or more school fees were not found for this institution'
                ], 404);
            }
        }

        $totalAmount = collect($validated['items'])->sum(fn ($item) => (float) $item['amount']);
        $totalAmount = round($totalAmount, 2);
        $tendered = isset($validated['amount_tendered']) ? round((float) $validated['amount_tendered'], 2) : null;
        $changeDue = $tendered !== null ? round(max($tendered - $totalAmount, 0), 2) : null;
        $paymentDate = $validated['payment_date'] ?? now()->toDateString();
        $receiptNumber = PaymentTransaction::generateUniqueReceiptNumber();

        $transaction = DB::transaction(function () use (
            $validated,
            $institutionId,
            $request,
            $totalAmount,
            $tendered,
            $changeDue,
            $paymentDate,
            $receiptNumber
        ) {
            $transaction = PaymentTransaction::create([
                'institution_id' => $institutionId,
                'student_id' => $validated['student_id'],
                'academic_year' => $validated['academic_year'],
                'payment_date' => $paymentDate,
                'payment_method' => $validated['payment_method'] ?? null,
                'reference_number' => $validated['reference_number'] ?? null,
                'or_number' => $validated['or_number'] ?? null,
                'receipt_number' => $receiptNumber,
                'remarks' => $validated['remarks'] ?? null,
                'total_amount' => $totalAmount,
                'amount_tendered' => $tendered,
                'change_due' => $changeDue,
                'received_by' => $request->user()?->id,
            ]);

            foreach ($validated['items'] as $item) {
                StudentPayment::create([
                    'institution_id' => $institutionId,
                    'student_id' => $validated['student_id'],
                    'payment_transaction_id' => $transaction->id,
                    'school_fee_id' => $item['school_fee_id'] ?? null,
                    'academic_year' => $validated['academic_year'],
                    'amount' => $item['amount'],
                    'payment_date' => $paymentDate,
                    'payment_method' => $validated['payment_method'] ?? null,
                    'reference_number' => $validated['reference_number'] ?? null,
                    'or_number' => $validated['or_number'] ?? null,
                    'receipt_number' => $receiptNumber,
                    'remarks' => $item['remarks'] ?? ($validated['remarks'] ?? null),
                    'received_by' => $request->user()?->id,
                ]);
            }

            return $transaction;
        });

        $transaction->load(['items.schoolFee', 'student', 'receivedBy']);

        return response()->json([
            'success' => true,
            'message' => 'Payment recorded successfully',
            'data' => $transaction
        ], 201);
    }

    /**
     * Display the specified payment.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access cashier payment endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $payment = StudentPayment::with(['schoolFee', 'student', 'receivedBy'])
            ->where('institution_id', $institutionId)
            ->find($id);

        if (!$payment) {
            return response()->json([
                'success' => false,
                'message' => 'Payment not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $payment
        ]);
    }

    /**
     * Get a simple receipt for the specified payment.
     */
    public function receipt(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access cashier payment endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $payment = StudentPayment::with(['schoolFee', 'student', 'institution', 'receivedBy'])
            ->where('institution_id', $institutionId)
            ->find($id);

        if (!$payment) {
            return response()->json([
                'success' => false,
                'message' => 'Payment not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'payment' => $payment,
                'student' => $payment->student,
                'institution' => $payment->institution,
                'received_by' => $payment->receivedBy,
            ]
        ]);
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
}
