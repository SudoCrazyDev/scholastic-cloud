<?php

namespace App\Http\Controllers;

use App\Models\StudentOnlinePaymentTransaction;
use App\Services\Payments\OnlinePaymentTransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InternalPaymentCallbackController extends Controller
{
    public function __construct(private OnlinePaymentTransactionService $transactionService)
    {
    }

    /**
     * Callback endpoint for the payments microservice to push gateway status updates.
     */
    public function mayaStatus(Request $request): JsonResponse
    {
        $expectedToken = (string) config('payments.callback.token');
        if ($expectedToken !== '') {
            $providedToken = (string) $request->header('X-Payments-Callback-Token');
            if ($providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized callback request'
                ], 401);
            }
        }

        $validated = $request->validate([
            'request_reference_number' => 'required|string|max:100',
            'status' => 'required|string|max:50',
            'charge_id' => 'nullable|string|max:255',
            'provider_payment_id' => 'nullable|string|max:255',
            'payment_status' => 'nullable|string|max:100',
            'payment_at' => 'nullable|string|max:255',
            'failure_reason' => 'nullable|string',
            'raw' => 'nullable|array',
        ]);

        $transaction = StudentOnlinePaymentTransaction::where(
            'request_reference_number',
            $validated['request_reference_number']
        )->first();

        if (!$transaction && !empty($validated['charge_id'])) {
            $transaction = StudentOnlinePaymentTransaction::where('provider_charge_id', $validated['charge_id'])->first();
        }

        if (!$transaction && !empty($validated['provider_payment_id'])) {
            $transaction = StudentOnlinePaymentTransaction::where(
                'provider_payment_id',
                $validated['provider_payment_id']
            )->first();
        }

        if (!$transaction) {
            return response()->json([
                'success' => true,
                'message' => 'No matching transaction found; callback acknowledged'
            ], 202);
        }

        $updatedTransaction = $this->transactionService->applyGatewayUpdate($transaction, $validated);

        return response()->json([
            'success' => true,
            'message' => 'Callback processed successfully',
            'data' => [
                'id' => $updatedTransaction->id,
                'status' => $updatedTransaction->status,
                'completed_payment_id' => $updatedTransaction->completed_payment_id,
            ]
        ]);
    }
}
