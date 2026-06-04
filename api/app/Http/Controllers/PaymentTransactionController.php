<?php

namespace App\Http\Controllers;

use App\Models\PaymentTransaction;
use App\Auth\StudentPortalUser;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class PaymentTransactionController extends Controller
{
    /**
     * Display the specified payment transaction with its line items.
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

        $transaction = PaymentTransaction::with(['items.schoolFee', 'student', 'receivedBy'])
            ->where('institution_id', $institutionId)
            ->find($id);

        if (!$transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Payment transaction not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $transaction
        ]);
    }

    /**
     * Get receipt data for the specified payment transaction.
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

        $transaction = PaymentTransaction::with(['items.schoolFee', 'student', 'institution', 'receivedBy'])
            ->where('institution_id', $institutionId)
            ->find($id);

        if (!$transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Payment transaction not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'transaction' => $transaction,
                'student' => $transaction->student,
                'institution' => $transaction->institution,
                'received_by' => $transaction->receivedBy,
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
