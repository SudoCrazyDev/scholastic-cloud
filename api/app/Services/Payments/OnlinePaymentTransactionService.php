<?php

namespace App\Services\Payments;

use App\Models\StudentOnlinePaymentTransaction;
use App\Models\StudentPayment;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class OnlinePaymentTransactionService
{
    /**
     * Apply a gateway status update and post to ledger on completion.
     */
    public function applyGatewayUpdate(StudentOnlinePaymentTransaction $transaction, array $payload): StudentOnlinePaymentTransaction
    {
        return DB::transaction(function () use ($transaction, $payload) {
            /** @var StudentOnlinePaymentTransaction $locked */
            $locked = StudentOnlinePaymentTransaction::where('id', $transaction->id)
                ->lockForUpdate()
                ->firstOrFail();

            $incomingStatus = $this->resolveStatus($payload);
            $currentStatus = (string) $locked->status;
            $status = $this->resolveNextStatus($currentStatus, $incomingStatus);

            $providerPaymentId = (string) (
                data_get($payload, 'provider_payment_id')
                ?? data_get($payload, 'checkout_id')
                ?? data_get($payload, 'id')
                ?? $locked->provider_payment_id
                ?? ''
            );

            $providerChargeId = (string) (
                data_get($payload, 'provider_charge_id')
                ?? data_get($payload, 'charge_id')
                ?? data_get($payload, 'id')
                ?? $locked->provider_charge_id
                ?? ''
            );

            $paidAt = $this->resolvePaidAt($payload, $status);
            $failureReason = (string) (
                data_get($payload, 'failure_reason')
                ?? data_get($payload, 'message')
                ?? data_get($payload, 'error')
                ?? data_get($payload, 'statusReason')
                ?? ''
            );

            $updateData = [
                'status' => $status,
                'provider_payment_id' => $providerPaymentId !== '' ? $providerPaymentId : $locked->provider_payment_id,
                'provider_charge_id' => $providerChargeId !== '' ? $providerChargeId : $locked->provider_charge_id,
                'paid_at' => $paidAt ?? $locked->paid_at,
                'failure_reason' => in_array($status, ['failed', 'expired', 'cancelled'], true)
                    ? ($failureReason !== '' ? $failureReason : $locked->failure_reason)
                    : null,
                'provider_response' => is_array(data_get($payload, 'provider_response'))
                    ? data_get($payload, 'provider_response')
                    : (is_array(data_get($payload, 'raw')) ? data_get($payload, 'raw') : $payload),
            ];

            if ($status === 'completed' && !$locked->completed_payment_id) {
                $paymentDate = ($paidAt ?? now())->toDateString();

                $studentPayment = StudentPayment::create([
                    'institution_id' => $locked->institution_id,
                    'student_id' => $locked->student_id,
                    'school_fee_id' => $locked->school_fee_id,
                    'academic_year' => $locked->academic_year,
                    'amount' => $locked->amount,
                    'payment_date' => $paymentDate,
                    'payment_method' => 'Online - Maya Checkout',
                    'reference_number' => $providerPaymentId !== '' ? $providerPaymentId : $locked->request_reference_number,
                    'receipt_number' => StudentPayment::generateUniqueReceiptNumber(),
                    'remarks' => 'Posted automatically from online payment gateway',
                    'received_by' => null,
                ]);

                $updateData['completed_payment_id'] = $studentPayment->id;
                $updateData['paid_at'] = $paidAt ?? now();
            }

            $locked->update($updateData);

            return $locked->fresh(['completedPayment', 'schoolFee', 'student']);
        });
    }

    public function resolveStatus(array $payload): string
    {
        $status = strtoupper((string) (data_get($payload, 'status') ?? ''));
        $paymentStatus = strtoupper((string) (data_get($payload, 'payment_status') ?? data_get($payload, 'paymentStatus') ?? ''));

        if (
            in_array($status, ['COMPLETED', 'CAPTURED', 'SUCCESS', 'PAID'], true) ||
            $paymentStatus === 'PAYMENT_SUCCESS'
        ) {
            return 'completed';
        }

        if ($status === 'AUTHORIZED' || $paymentStatus === 'AUTHORIZED') {
            return 'authorized';
        }

        if (
            in_array($status, ['FAILED', 'DECLINED'], true) ||
            $paymentStatus === 'PAYMENT_FAILED'
        ) {
            return 'failed';
        }

        if ($status === 'EXPIRED' || $paymentStatus === 'PAYMENT_EXPIRED') {
            return 'expired';
        }

        if (
            in_array($status, ['CANCELLED', 'VOIDED'], true) ||
            $paymentStatus === 'PAYMENT_CANCELLED'
        ) {
            return 'cancelled';
        }

        return 'pending';
    }

    private function resolveNextStatus(string $currentStatus, string $incomingStatus): string
    {
        $current = strtolower($currentStatus);
        $incoming = strtolower($incomingStatus);

        if ($current === 'completed' && $incoming !== 'completed') {
            return 'completed';
        }

        if (in_array($current, ['failed', 'expired', 'cancelled'], true) && $incoming === 'pending') {
            return $current;
        }

        return $incoming;
    }

    private function resolvePaidAt(array $payload, string $status): ?Carbon
    {
        $candidate = data_get($payload, 'payment_at')
            ?? data_get($payload, 'paymentAt')
            ?? data_get($payload, 'paid_at')
            ?? data_get($payload, 'updatedAt');

        if (is_string($candidate) && $candidate !== '') {
            try {
                return Carbon::parse($candidate);
            } catch (\Throwable) {
                // Ignore parse errors and fall back.
            }
        }

        if ($status === 'completed') {
            return now();
        }

        return null;
    }
}
