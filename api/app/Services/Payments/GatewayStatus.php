<?php

namespace App\Services\Payments;

/**
 * The one status vocabulary the platform speaks.
 *
 * Every provider names these differently — Maya has PAYMENT_SUCCESS, Stripe has
 * succeeded, Xendit has PAID — and translating at the edge is the whole point
 * of the driver layer. Nothing past a driver should ever see a provider's own
 * word for a status.
 */
final class GatewayStatus
{
    public const PENDING = 'pending';

    public const AUTHORIZED = 'authorized';

    public const COMPLETED = 'completed';

    public const FAILED = 'failed';

    public const EXPIRED = 'expired';

    public const CANCELLED = 'cancelled';

    /**
     * @return array<string>
     */
    public static function all(): array
    {
        return [
            self::PENDING,
            self::AUTHORIZED,
            self::COMPLETED,
            self::FAILED,
            self::EXPIRED,
            self::CANCELLED,
        ];
    }

    /**
     * Statuses that end the transaction. Nothing moves out of one of these,
     * which is what makes a replayed webhook harmless.
     *
     * @return array<string>
     */
    public static function terminal(): array
    {
        return [self::COMPLETED, self::FAILED, self::EXPIRED, self::CANCELLED];
    }

    public static function isTerminal(string $status): bool
    {
        return in_array($status, self::terminal(), true);
    }

    public static function normalize(?string $status): string
    {
        $status = strtolower(trim((string) $status));

        return in_array($status, self::all(), true) ? $status : self::PENDING;
    }
}
