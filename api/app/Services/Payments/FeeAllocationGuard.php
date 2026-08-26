<?php

namespace App\Services\Payments;

use App\Models\SchoolFee;
use App\Models\StudentAdditionalFee;

/**
 * The rules every set of payment lines has to satisfy before it is posted, whether the
 * lines came from the cashier's till or from a reviewer subdividing an approved receipt.
 *
 * A line settles a school fee **or** an additional fee (an ad-hoc charge or a late fee)
 * and never both; with neither set it is a "General / Other" payment that just reduces
 * the overall balance. School fees must belong to the institution, and additional fees
 * must belong to this student and this academic year — otherwise a receipt could be made
 * to settle a charge on someone else's account.
 */
class FeeAllocationGuard
{
    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @return array{message: string, status: int}|null  null when every line checks out
     */
    public static function check(
        array $lines,
        string $institutionId,
        string $studentId,
        string $academicYear
    ): ?array {
        foreach ($lines as $line) {
            if (! empty($line['school_fee_id']) && ! empty($line['additional_fee_id'])) {
                return [
                    'message' => 'A payment line can settle a school fee or an additional fee, not both',
                    'status' => 422,
                ];
            }
        }

        $feeIds = self::idsOf($lines, 'school_fee_id');
        if ($feeIds !== []) {
            $found = SchoolFee::where('institution_id', $institutionId)
                ->whereIn('id', $feeIds)
                ->count();

            if ($found !== count($feeIds)) {
                return [
                    'message' => 'One or more school fees were not found for this institution',
                    'status' => 404,
                ];
            }
        }

        $additionalFeeIds = self::idsOf($lines, 'additional_fee_id');
        if ($additionalFeeIds !== []) {
            $found = StudentAdditionalFee::where('institution_id', $institutionId)
                ->where('student_id', $studentId)
                ->where('academic_year', $academicYear)
                ->whereIn('id', $additionalFeeIds)
                ->count();

            if ($found !== count($additionalFeeIds)) {
                return [
                    'message' => 'One or more additional fees were not found for this student and academic year',
                    'status' => 404,
                ];
            }
        }

        return null;
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @return string[]
     */
    private static function idsOf(array $lines, string $key): array
    {
        return array_values(array_unique(array_filter(
            array_map(fn ($line) => $line[$key] ?? null, $lines)
        )));
    }
}
