<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\SchoolFee;
use App\Models\StudentPayment;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class StudentPaymentController extends Controller
{
    /**
     * Display a listing of student payments.
     */
    public function index(Request $request): JsonResponse
    {
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
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
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
            'receipt_number' => $this->generateReceiptNumber(),
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
     * Display the specified payment.
     */
    public function show(Request $request, string $id): JsonResponse
    {
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

    private function generateReceiptNumber(): string
    {
        $prefix = 'RCPT-' . now()->format('Ymd');

        do {
            $receiptNumber = $prefix . '-' . Str::upper(Str::random(6));
            $exists = StudentPayment::where('receipt_number', $receiptNumber)->exists();
        } while ($exists);

        return $receiptNumber;
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
