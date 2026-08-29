<?php

namespace App\Services\Payments;

use App\Models\StudentOnlinePaymentTransaction;
use App\Models\StudentPayment;
use App\Services\Payments\Data\GatewayEvent;
use Illuminate\Support\Facades\DB;

/**
 * Turns a gateway status change into a posting on the student's ledger.
 *
 * Provider-blind by construction: it is handed a GatewayEvent, which a driver
 * has already translated out of its provider's own vocabulary. Adding a second
 * provider must never mean touching this class — it is the one place a payment
 * becomes money owed against a student, and one place is the point.
 */
class OnlinePaymentTransactionService
{
    /**
     * Apply a status change and, on completion, post to the ledger.
     *
     * @param  string|null  $paymentMethodLabel  how the provider should read on the receipt
     */
    public function applyGatewayUpdate(
        StudentOnlinePaymentTransaction $transaction,
        GatewayEvent $event,
        ?string $paymentMethodLabel = null,
    ): StudentOnlinePaymentTransaction {
        return DB::transaction(function () use ($transaction, $event, $paymentMethodLabel) {
            /*
             * Re-read under a lock rather than trusting what was passed in.
             * Providers retry callbacks, and a payer refreshing the return page
             * while a webhook lands means two requests reaching here for the
             * same transaction at once.
             */
            /** @var StudentOnlinePaymentTransaction $locked */
            $locked = StudentOnlinePaymentTransaction::where('id', $transaction->id)
                ->lockForUpdate()
                ->firstOrFail();

            $status = $this->resolveNextStatus((string) $locked->status, $event->status);

            $providerPaymentId = $event->providerPaymentId ?: $locked->provider_payment_id;
            $providerChargeId = $event->providerChargeId ?: $locked->provider_charge_id;

            $paidAt = $event->paidAt
                ?? ($status === GatewayStatus::COMPLETED ? now() : null);

            $updateData = [
                'status' => $status,
                'provider_payment_id' => $providerPaymentId,
                'provider_charge_id' => $providerChargeId,
                'paid_at' => $paidAt ?? $locked->paid_at,
                'failure_reason' => in_array($status, [GatewayStatus::FAILED, GatewayStatus::EXPIRED, GatewayStatus::CANCELLED], true)
                    ? ($event->failureReason ?: $locked->failure_reason)
                    : null,
                'provider_response' => $event->raw !== [] ? $event->raw : $locked->provider_response,
            ];

            /*
             * `completed_payment_id` is the idempotency guard, and it is the
             * reason this whole method is inside a lock: without it a retried
             * webhook credits the student twice.
             */
            if ($status === GatewayStatus::COMPLETED && ! $locked->completed_payment_id) {
                $studentPayment = StudentPayment::create([
                    'institution_id' => $locked->institution_id,
                    'student_id' => $locked->student_id,
                    'school_fee_id' => $locked->school_fee_id,
                    'academic_year' => $locked->academic_year,
                    'amount' => $locked->amount,
                    'payment_date' => ($paidAt ?? now())->toDateString(),
                    'payment_method' => $paymentMethodLabel ?: 'Online payment',
                    'reference_number' => $providerPaymentId ?: $locked->request_reference_number,
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

    /**
     * Which status wins when an incoming event disagrees with what we hold.
     *
     * Two rules, both about not losing money that was actually collected:
     *
     *   - Completed is absorbing. A late "expired" callback for a payment that
     *     already posted must not unpost it.
     *   - A settled failure is not reopened by a "pending". But it *is* reopened
     *     by a "completed", deliberately: the browser marks a transaction
     *     cancelled when the payer is redirected back through the cancel URL,
     *     and a payer who cancels, goes back and pays would otherwise have a
     *     real payment discarded.
     */
    private function resolveNextStatus(string $currentStatus, string $incomingStatus): string
    {
        $current = GatewayStatus::normalize($currentStatus);
        $incoming = GatewayStatus::normalize($incomingStatus);

        if ($current === GatewayStatus::COMPLETED) {
            return GatewayStatus::COMPLETED;
        }

        if (GatewayStatus::isTerminal($current) && $incoming === GatewayStatus::PENDING) {
            return $current;
        }

        return $incoming;
    }
}
