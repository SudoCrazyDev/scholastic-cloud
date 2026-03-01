<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    /**
     * Create a payment charge (called by main API).
     */
    public function createCharge(Request $request): JsonResponse
    {
        // TODO: integrate Stripe/payment provider; validate internal auth
        return response()->json([
            'message' => 'Payment charge creation – implement with Stripe/provider',
            'received' => $request->all(),
        ], 501);
    }

    /**
     * Get charge status (called by main API).
     */
    public function showCharge(string $id): JsonResponse
    {
        // TODO: fetch from provider or DB
        return response()->json([
            'message' => 'Charge status – implement with Stripe/provider',
            'id' => $id,
        ], 501);
    }

    /**
     * Stripe (or provider) webhook – verify signature and process events.
     */
    public function stripeWebhook(Request $request): JsonResponse
    {
        // TODO: verify webhook signature, process payment_intent.succeeded, etc.
        return response()->json(['received' => true], 200);
    }
}
