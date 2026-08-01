<?php

namespace App\Services\Tala;

use App\Models\TalaCredential;
use App\Models\TalaMessage;
use Carbon\CarbonImmutable;

/**
 * Keeps one teacher from spending a school's whole AI budget.
 *
 * Only messages sent on the institution's key are counted. A teacher on their
 * own key is spending their own money and is nobody else's problem.
 */
class UsageGuard
{
    /**
     * Messages this teacher has sent on the school's key this month, and the
     * cap they are counted against.
     *
     * @return array{used: int, limit: int|null, remaining: int|null, exceeded: bool}
     */
    public function status(string $institutionId, string $userId, ?int $limit): array
    {
        if ($limit === null || $limit <= 0) {
            return ['used' => 0, 'limit' => null, 'remaining' => null, 'exceeded' => false];
        }

        $used = $this->countThisMonth($institutionId, $userId);

        return [
            'used' => $used,
            'limit' => $limit,
            'remaining' => max(0, $limit - $used),
            'exceeded' => $used >= $limit,
        ];
    }

    public function exceeded(ResolvedCredential $credential, string $institutionId, string $userId): bool
    {
        if (! $credential->isInstitutionWide()) {
            return false;
        }

        return $this->status($institutionId, $userId, $credential->monthlyMessageLimit)['exceeded'];
    }

    /**
     * The month is counted in school time, not server time.
     *
     * config/app.php pins the app to UTC while the schools run on Asia/Manila,
     * so a naive `whereMonth` would roll a teacher's allowance over at 8am on
     * the 1st and hand back eight hours of the previous month's usage. The
     * window is built in the school's timezone and converted back to UTC for
     * the query, which is also why this is a range rather than a date function.
     */
    private function countThisMonth(string $institutionId, string $userId): int
    {
        $timezone = (string) config('tala.timezone', 'Asia/Manila');
        $localNow = CarbonImmutable::now($timezone);

        $start = $localNow->startOfMonth()->utc();
        $end = $localNow->endOfMonth()->utc();

        return TalaMessage::query()
            ->where('institution_id', $institutionId)
            ->where('user_id', $userId)
            ->where('role', TalaMessage::ROLE_USER)
            ->where('credential_source', TalaCredential::SOURCE_INSTITUTION)
            ->whereBetween('created_at', [$start, $end])
            ->count();
    }
}
