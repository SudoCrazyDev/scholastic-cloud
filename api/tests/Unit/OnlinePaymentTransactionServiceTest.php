<?php

namespace Tests\Unit;

use App\Services\Payments\OnlinePaymentTransactionService;
use PHPUnit\Framework\TestCase;

class OnlinePaymentTransactionServiceTest extends TestCase
{
    public function test_resolve_status_completed_from_payment_success(): void
    {
        $service = new OnlinePaymentTransactionService();

        $status = $service->resolveStatus([
            'paymentStatus' => 'PAYMENT_SUCCESS',
        ]);

        $this->assertSame('completed', $status);
    }

    public function test_resolve_status_authorized(): void
    {
        $service = new OnlinePaymentTransactionService();

        $status = $service->resolveStatus([
            'status' => 'AUTHORIZED',
        ]);

        $this->assertSame('authorized', $status);
    }

    public function test_resolve_status_failed_expired_cancelled_and_pending(): void
    {
        $service = new OnlinePaymentTransactionService();

        $this->assertSame('failed', $service->resolveStatus(['paymentStatus' => 'PAYMENT_FAILED']));
        $this->assertSame('expired', $service->resolveStatus(['paymentStatus' => 'PAYMENT_EXPIRED']));
        $this->assertSame('cancelled', $service->resolveStatus(['paymentStatus' => 'PAYMENT_CANCELLED']));
        $this->assertSame('pending', $service->resolveStatus(['paymentStatus' => 'PENDING_PAYMENT']));
    }
}
