import React from 'react'
import type { PayslipTemplateElement } from '../../../types'
import type { PayslipSheetData } from './payslipSheetData'

const money = (amount: number) =>
  amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function LabeledRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`pslip-row${bold ? ' pslip-bold' : ''}`}>
      <span className="pslip-label">{label}</span>
      <span className="pslip-value">{value}</span>
    </div>
  )
}

function ElementView({ element, data }: { element: PayslipTemplateElement; data: PayslipSheetData }) {
  switch (element.type) {
    case 'institution_logo':
      return data.institutionLogo ? (
        <img src={data.institutionLogo} alt="" className="pslip-logo" />
      ) : (
        <div className="pslip-logo pslip-logo-placeholder">Logo</div>
      )
    case 'institution_name':
      return <div className="pslip-inst">{data.institutionName}</div>
    case 'institution_address':
      return <div className="pslip-addr">{data.institutionAddress}</div>
    case 'title':
      return <div className="pslip-title">{element.content || 'PAY SLIP'}</div>
    case 'pay_date':
      return <LabeledRow label="Pay Date:" value={data.payDate} />
    case 'employee_name':
      return <LabeledRow label="Name of Employee:" value={data.employeeName} />
    case 'designation':
      return <LabeledRow label="Designation:" value={data.designation} />
    case 'covered_period':
      return <LabeledRow label="Covered Period:" value={data.coveredPeriod} />
    case 'daily_rate':
      return <LabeledRow label="Daily Rate:" value={money(data.dailyRate)} />
    case 'hourly_rate':
      return <LabeledRow label="Hourly Rate:" value={money(data.hourlyRate)} />
    case 'total_working_days':
      return <LabeledRow label="Total Working Days:" value={String(data.totalWorkingDays)} />
    case 'total_hours':
      return <LabeledRow label="Total Hours Worked:" value={String(data.totalHours)} />
    case 'total_salary_earned':
      return <LabeledRow label="TOTAL SALARY EARNED:" value={money(data.grossPay)} bold />
    case 'deductions_list':
      return (
        <div>
          <div className="pslip-row">
            <span className="pslip-label">Deductions:</span>
            <span className="pslip-value" />
          </div>
          {data.deductions.length === 0 ? (
            <div className="pslip-row pslip-indent">
              <span className="pslip-label">None</span>
              <span className="pslip-value" />
            </div>
          ) : (
            data.deductions.map((deduction, index) => (
              <div key={index} className="pslip-row pslip-indent">
                <span className="pslip-label">{deduction.name}</span>
                <span className="pslip-value">{money(deduction.amount)}</span>
              </div>
            ))
          )}
          <div className="pslip-row pslip-bold">
            <span className="pslip-label">TOTAL</span>
            <span className="pslip-value">{money(data.totalDeductions)}</span>
          </div>
        </div>
      )
    case 'total_deductions':
      return <LabeledRow label="TOTAL DEDUCTIONS:" value={money(data.totalDeductions)} bold />
    case 'employer_benefits_list':
      return (
        <div>
          <div className="pslip-row">
            <span className="pslip-label">Employer's Share:</span>
            <span className="pslip-value" />
          </div>
          {data.employerBenefits.length === 0 ? (
            <div className="pslip-row pslip-indent">
              <span className="pslip-label">None</span>
              <span className="pslip-value" />
            </div>
          ) : (
            data.employerBenefits.map((benefit, index) => (
              <div key={index} className="pslip-row pslip-indent">
                <span className="pslip-label">{benefit.name}</span>
                <span className="pslip-value">{money(benefit.amount)}</span>
              </div>
            ))
          )}
          <div className="pslip-row pslip-bold">
            <span className="pslip-label">TOTAL</span>
            <span className="pslip-value">{money(data.employerShareTotal)}</span>
          </div>
        </div>
      )
    case 'net_pay':
      return (
        <div className="pslip-row pslip-net">
          <span className="pslip-label">NET PAY:</span>
          <span className="pslip-value">{money(data.netPay)}</span>
        </div>
      )
    case 'pay_master':
      return <LabeledRow label="Pay Master:" value={element.content || ''} />
    case 'received_by':
      return (
        <div className="pslip-sig">
          <span className="pslip-label">Received by:</span>
          <span className="pslip-sigline" />
        </div>
      )
    case 'signature_line':
      return (
        <div className="pslip-sigblock">
          <div className="pslip-sigline-center" />
          <div className="pslip-siglabel">{element.content || 'Signature'}</div>
        </div>
      )
    case 'divider':
      return <div className="pslip-divider" />
    case 'custom_text':
      return <div className="pslip-custom">{element.content || ''}</div>
    case 'spacer':
      return <div className="pslip-spacer" />
    default:
      return null
  }
}

/**
 * Renders a payslip template layout against data. Styles live in an
 * embedded <style> tag so the markup survives being copied into a
 * print popup (Tailwind classes would be lost there).
 */
export const PayslipSheet: React.FC<{
  layout: PayslipTemplateElement[]
  data: PayslipSheetData
}> = ({ layout, data }) => (
  <>
    <style>{`
      .pslip { font-family: Arial, Helvetica, sans-serif; color: #000; max-width: 360px; margin: 0 auto; font-size: 12px; border: 1px solid #000; padding: 10px 12px; background: #fff; }
      .pslip-logo { width: 48px; height: 48px; object-fit: contain; margin: 0 auto 2px; display: block; }
      .pslip-logo-placeholder { display: flex; align-items: center; justify-content: center; background: #eee; border-radius: 50%; font-size: 10px; color: #999; }
      .pslip-inst { text-align: center; font-weight: bold; font-size: 13px; }
      .pslip-addr { text-align: center; font-size: 10px; }
      .pslip-title { text-align: center; font-weight: bold; font-size: 16px; text-decoration: underline; margin: 6px 0; }
      .pslip-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; padding: 2px 0; border-bottom: 1px solid #ddd; }
      .pslip-row .pslip-label { white-space: nowrap; }
      .pslip-row .pslip-value { flex: 1; text-align: right; font-weight: 500; }
      .pslip-bold { font-weight: bold; }
      .pslip-bold .pslip-value { font-weight: bold; }
      .pslip-indent { padding-left: 16px; }
      .pslip-net { font-weight: bold; border-top: 2px solid #000; border-bottom: 3px double #000; margin-top: 2px; }
      .pslip-net .pslip-label { color: #cc0000; }
      .pslip-net .pslip-value { font-weight: bold; }
      .pslip-sig { display: flex; align-items: flex-end; gap: 8px; padding-top: 14px; }
      .pslip-sig .pslip-sigline { flex: 1; border-bottom: 1px solid #000; height: 1.2em; }
      .pslip-sigblock { padding-top: 18px; text-align: center; }
      .pslip-sigline-center { border-bottom: 1px solid #000; width: 160px; margin: 0 auto; }
      .pslip-siglabel { font-size: 10px; margin-top: 2px; }
      .pslip-divider { border-top: 1px solid #000; margin: 4px 0; }
      .pslip-custom { text-align: center; font-size: 11px; padding: 1px 0; }
      .pslip-spacer { height: 10px; }
    `}</style>
    <div className="pslip">
      {layout.map((element) => (
        <ElementView key={element.id} element={element} data={data} />
      ))}
    </div>
  </>
)
