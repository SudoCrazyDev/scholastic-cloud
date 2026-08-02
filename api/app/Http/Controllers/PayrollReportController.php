<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollDeductionType;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\PayslipDeduction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Payroll reporting — the figures a school signs cheques and remittances
 * against, as opposed to the per-employee detail the payroll sheet carries.
 */
class PayrollReportController extends Controller
{
    /**
     * What one payroll period costs, totalled.
     *
     * Three different questions get asked of a finished period, and they have
     * three different answers: how much cash goes out to staff (net pay), how
     * much was withheld from them (the employee side), and how much the school
     * owes on top of the salaries (the employer side). The last one never
     * touches a payslip's net — an employer share is a cost, not a deduction —
     * so it has to be reported separately or the school under-remits.
     *
     * The per-deduction breakdown is what the remittance forms are filled in
     * from: SSS wants its employee and employer columns apart.
     */
    public function periodSummary(Request $request, string $periodId): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $period = PayrollPeriod::with('institution')
            ->where('institution_id', $institutionId)
            ->find($periodId);

        if (! $period) {
            return response()->json(['success' => false, 'message' => 'Payroll period not found'], 404);
        }

        $payslips = $period->payslips()->with('deductions')->get();

        // Line order follows the institution's catalog, so the report keeps the
        // same shape month to month and lines up with the payroll sheet.
        $catalogPosition = PayrollDeductionType::where('institution_id', $institutionId)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->pluck('id')
            ->flip();

        $lines = [];

        foreach ($payslips as $payslip) {
            // Two lines can share one report row (same catalog type, or the same
            // ad-hoc name). Collapsing them per payslip first keeps one staff
            // member from being counted twice against the same deduction.
            $byKey = [];
            foreach ($payslip->deductions as $deduction) {
                $key = $this->lineKey($deduction);

                if (! isset($lines[$key])) {
                    $lines[$key] = [
                        'key' => $key,
                        'name' => $deduction->name,
                        // Ad-hoc lines (no catalog type) trail behind the catalog ones.
                        'position' => $deduction->deduction_type_id !== null
                            ? ($catalogPosition[$deduction->deduction_type_id] ?? 9998)
                            : 9999,
                        'employee_count' => 0,
                        'employee_amount' => 0.0,
                        'employer_amount' => 0.0,
                    ];
                }

                $byKey[$key] = [
                    'employee' => ($byKey[$key]['employee'] ?? 0) + (float) $deduction->amount,
                    'employer' => ($byKey[$key]['employer'] ?? 0) + (float) $deduction->employer_amount,
                ];
            }

            foreach ($byKey as $key => $amounts) {
                // A line carried at zero — an exempt staff member, or a bracket
                // that priced to nothing — is not someone the deduction hit.
                if ($amounts['employee'] > 0 || $amounts['employer'] > 0) {
                    $lines[$key]['employee_count']++;
                }
                $lines[$key]['employee_amount'] += $amounts['employee'];
                $lines[$key]['employer_amount'] += $amounts['employer'];
            }
        }

        $deductions = collect($lines)
            ->sortBy(fn (array $line) => sprintf('%04d', $line['position']).mb_strtolower($line['name']))
            ->values()
            ->map(fn (array $line) => [
                'key' => $line['key'],
                'name' => $line['name'],
                'employee_count' => $line['employee_count'],
                'employee_amount' => round($line['employee_amount'], 2),
                'employer_amount' => round($line['employer_amount'], 2),
                'total_amount' => round($line['employee_amount'] + $line['employer_amount'], 2),
            ]);

        $grossTotal = round($payslips->sum(fn (Payslip $payslip) => (float) $payslip->gross_pay), 2);
        $employeeDeductionTotal = round($payslips->sum(fn (Payslip $payslip) => (float) $payslip->total_deductions), 2);
        $employerContributionTotal = round($deductions->sum('employer_amount'), 2);
        $netTotal = round($payslips->sum(fn (Payslip $payslip) => (float) $payslip->net_pay), 2);

        return response()->json([
            'success' => true,
            'data' => [
                'period' => [
                    'id' => $period->id,
                    'name' => $period->name,
                    'date_from' => $period->date_from?->toDateString(),
                    'date_to' => $period->date_to?->toDateString(),
                    'status' => $period->status,
                    'paid_on' => $period->paid_on?->toDateString(),
                ],
                'institution' => [
                    'name' => $period->institution?->title,
                    'address' => $period->institution?->address,
                ],
                'summary' => [
                    'employee_count' => $payslips->count(),
                    // Salary earned, already net of late, undertime and absences.
                    'gross_total' => $grossTotal,
                    'employee_deduction_total' => $employeeDeductionTotal,
                    'employer_contribution_total' => $employerContributionTotal,
                    // The cash that actually leaves the payroll account for staff.
                    'net_total' => $netTotal,
                    // Salaries plus the employer's own share — what the period
                    // costs the school, which is always more than the payout.
                    'payroll_cost_total' => round($grossTotal + $employerContributionTotal, 2),
                ],
                'deductions' => $deductions,
            ],
        ]);
    }

    /**
     * Which report row a deduction line belongs to. Lines off the same catalog
     * type share a row; ad-hoc lines group by name.
     */
    private function lineKey(PayslipDeduction $deduction): string
    {
        return $deduction->deduction_type_id ?: 'name:'.mb_strtolower(trim($deduction->name));
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        return $institutionId;
    }

    /**
     * Reporting sits behind the same permission as the rest of payroll — a
     * period total is every salary in the school added up.
     */
    private function isPayrollManager(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        return $user->hasModuleAccess('payroll', 'manage');
    }

    private function payrollForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'You are not allowed to manage payroll',
        ], 403);
    }

    private function noInstitution(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'User does not have any institution assigned',
        ], 400);
    }
}
