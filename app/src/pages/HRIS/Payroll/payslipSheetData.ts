import type { Payslip, PayslipTemplateElement, PayslipTemplateElementType } from '../../../types'
import { longDate, parseYmd } from './helpers'
/**
 * Data a payslip template renders against — either a real payslip
 * (print) or sample values (designer preview).
 */
export interface PayslipSheetData {
  institutionName: string
  institutionAddress: string
  institutionLogo: string | null
  employeeName: string
  designation: string
  payDate: string
  coveredPeriod: string
  dailyRate: number
  hourlyRate: number
  totalWorkingDays: number
  totalHours: number
  grossPay: number
  deductions: { name: string; amount: number }[]
  totalDeductions: number
  employerBenefits: { name: string; amount: number }[]
  employerShareTotal: number
  netPay: number
}

export const PAYSLIP_ELEMENT_PALETTE: { type: PayslipTemplateElementType; label: string }[] = [
  { type: 'institution_logo', label: 'Institution Logo' },
  { type: 'institution_name', label: 'Institution Name' },
  { type: 'institution_address', label: 'Institution Address' },
  { type: 'title', label: 'Title (e.g. PAY SLIP)' },
  { type: 'pay_date', label: 'Pay Date' },
  { type: 'employee_name', label: 'Employee Name' },
  { type: 'designation', label: 'Designation' },
  { type: 'covered_period', label: 'Covered Period' },
  { type: 'daily_rate', label: 'Daily Rate' },
  { type: 'hourly_rate', label: 'Hourly Rate' },
  { type: 'total_working_days', label: 'Total Working Days' },
  { type: 'total_hours', label: 'Total Hours Worked' },
  { type: 'total_salary_earned', label: 'Total Salary Earned' },
  { type: 'deductions_list', label: 'Deductions (itemized)' },
  { type: 'total_deductions', label: 'Total Deductions' },
  { type: 'employer_benefits_list', label: "Employer's Share (itemized)" },
  { type: 'net_pay', label: 'Net Pay' },
  { type: 'pay_master', label: 'Pay Master' },
  { type: 'received_by', label: 'Received By' },
  { type: 'signature_line', label: 'Signature Line' },
  { type: 'divider', label: 'Divider Line' },
  { type: 'custom_text', label: 'Custom Text' },
  { type: 'spacer', label: 'Spacer' },
]

// Starter layout matching the classic paper pay slip.
export const SAMPLE_PAYSLIP_LAYOUT: PayslipTemplateElement[] = [
  { id: 'sample-1', type: 'institution_logo' },
  { id: 'sample-2', type: 'institution_name' },
  { id: 'sample-3', type: 'institution_address' },
  { id: 'sample-4', type: 'title', content: 'PAY SLIP' },
  { id: 'sample-5', type: 'pay_date' },
  { id: 'sample-6', type: 'employee_name' },
  { id: 'sample-7', type: 'covered_period' },
  { id: 'sample-8', type: 'daily_rate' },
  { id: 'sample-9', type: 'total_working_days' },
  { id: 'sample-10', type: 'total_salary_earned' },
  { id: 'sample-11', type: 'deductions_list' },
  { id: 'sample-12', type: 'net_pay' },
  { id: 'sample-13', type: 'pay_master', content: '' },
  { id: 'sample-14', type: 'received_by' },
]

export const SAMPLE_SHEET_DATA: PayslipSheetData = {
  institutionName: 'MARANATHA CHRISTIAN ACADEMY',
  institutionAddress: 'Tiongson Street, Lagao, GSC',
  institutionLogo: null,
  employeeName: 'Juan Dela Cruz',
  designation: 'Classroom Teacher',
  payDate: 'June 30, 2026',
  coveredPeriod: 'June 1 – June 30, 2026',
  dailyRate: 750,
  hourlyRate: 93.75,
  totalWorkingDays: 21,
  totalHours: 168,
  grossPay: 15750,
  deductions: [
    { name: 'Vale', amount: 500 },
    { name: 'S.S.S.', amount: 540 },
    { name: 'PhilHealth', amount: 281.25 },
    { name: 'HDMF', amount: 200 },
  ],
  totalDeductions: 1521.25,
  employerBenefits: [
    { name: 'S.S.S.', amount: 1060 },
    { name: 'PhilHealth', amount: 281.25 },
    { name: 'HDMF', amount: 200 },
  ],
  employerShareTotal: 1541.25,
  netPay: 14228.75,
}

export const sheetDataFromPayslip = (payslip: Payslip): PayslipSheetData => {
  const period = payslip.period
  const range = period
    ? `${parseYmd(period.date_from).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${parseYmd(period.date_to).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : ''

  return {
    institutionName: payslip.institution_name || '',
    institutionAddress: payslip.institution_address || '',
    institutionLogo: payslip.institution_logo,
    employeeName: payslip.staff_name,
    designation: payslip.designation || '',
    payDate: period?.paid_on ? longDate(period.paid_on) : '',
    coveredPeriod: range,
    dailyRate: payslip.daily_rate,
    hourlyRate: payslip.hourly_rate,
    totalWorkingDays: payslip.days_worked,
    totalHours: payslip.hours_worked,
    grossPay: payslip.gross_pay,
    deductions: payslip.deductions.map((d) => ({ name: d.name, amount: d.amount })),
    totalDeductions: payslip.total_deductions,
    employerBenefits: payslip.deductions
      .filter((d) => d.employer_amount > 0)
      .map((d) => ({ name: d.name, amount: d.employer_amount })),
    employerShareTotal: payslip.employer_share_total,
    netPay: payslip.net_pay,
  }
}

