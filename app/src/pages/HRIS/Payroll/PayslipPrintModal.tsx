import React, { useRef } from 'react'
import { Button } from '../../../components/button'
import type { Payslip } from '../../../types'
import { dayLabel, longDate, parseYmd, time12 } from './helpers'

interface PayslipPrintModalProps {
  payslip: Payslip
  onClose: () => void
}

const money = (amount: number) =>
  amount ? amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

const moneyOrDash = (amount: number) => (amount ? money(amount) : '—')

/**
 * Replicates the paper "Employee's Salary and Working Time Record" form.
 * All styles live in the embedded <style> tag so the markup survives the
 * copy into the print popup (Tailwind classes would be lost there).
 */
const PayslipPrintModal: React.FC<PayslipPrintModalProps> = ({ payslip, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null)

  const period = payslip.period
  const fromDate = period ? parseYmd(period.date_from) : null
  const toDate = period ? parseYmd(period.date_to) : null
  const year = toDate?.getFullYear() ?? new Date().getFullYear()
  const fmtDay = (d: Date | null) =>
    d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '________'

  const handlePrint = () => {
    if (!printRef.current) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Salary and Working Time Record — ${payslip.staff_name}</title></head>
      <body style="margin:0;padding:16px;">
        ${printRef.current.innerHTML}
        <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
      </body></html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Employee's Salary and Working Time Record</h3>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={handlePrint}>
              Print
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="p-6">
          <div ref={printRef}>
            <style>{`
              .swtr { font-family: Arial, Helvetica, sans-serif; color: #000; max-width: 820px; margin: 0 auto; font-size: 11px; }
              .swtr-head { display: flex; justify-content: space-between; align-items: flex-start; }
              .swtr-inst { font-weight: bold; font-size: 13px; }
              .swtr-addr { font-size: 11px; }
              .swtr-paidon { font-size: 11px; white-space: nowrap; }
              .swtr-line { display: inline-block; border-bottom: 1px solid #000; min-width: 130px; text-align: center; }
              .swtr-title { text-align: center; font-weight: bold; font-size: 16px; margin: 10px 0; }
              .swtr-meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 11px; }
              .swtr table.swtr-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
              .swtr-grid th, .swtr-grid td { border: 1px solid #000; padding: 1.5px 3px; font-size: 10px; text-align: center; vertical-align: middle; overflow: hidden; }
              .swtr-grid th { font-weight: bold; }
              .swtr-grid .num { text-align: right; }
              .swtr-red { color: #cc0000; }
              .swtr-totals td { font-weight: bold; }
              .swtr-cert { border: 1px solid #000; border-top: none; padding: 4px 6px; font-size: 10px; text-align: left; }
              .swtr-sigs { display: flex; justify-content: space-between; gap: 24px; margin-top: 14px; font-size: 11px; }
              .swtr-sig { flex: 1; }
              .swtr-sig .swtr-sigline { border-bottom: 1px solid #000; height: 28px; margin: 4px 12px 2px; }
              .swtr-sig .swtr-siglabel { text-align: center; font-size: 10px; }
              .swtr-sig .swtr-sigtitle { font-weight: bold; }
              @media print { .swtr { max-width: none; } }
            `}</style>
            <div className="swtr">
              <div className="swtr-head">
                <div>
                  <div className="swtr-inst">{(payslip.institution_name || '').toUpperCase()}</div>
                  <div className="swtr-addr">{payslip.institution_address || ''}</div>
                </div>
                <div className="swtr-paidon">
                  Paid on <span className="swtr-line">{period?.paid_on ? longDate(period.paid_on) : ''}</span>
                </div>
              </div>

              <div className="swtr-title">Employee's Salary and Working Time Record</div>

              <div className="swtr-meta">
                <span>
                  Name of Employee: <b style={{ textDecoration: 'underline' }}>{payslip.staff_name}</b>
                </span>
                <span>
                  Designation: <b style={{ textDecoration: 'underline' }}>{payslip.designation || '________'}</b>
                </span>
                <span>
                  From <b style={{ textDecoration: 'underline' }}>{fmtDay(fromDate)}</b> to{' '}
                  <b style={{ textDecoration: 'underline' }}>{fmtDay(toDate)}</b>, {year}
                </span>
              </div>

              <table className="swtr-grid">
                <colgroup>
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '7.5%' }} />
                  <col style={{ width: '7.5%' }} />
                  <col style={{ width: '6.5%' }} />
                  <col style={{ width: '6.5%' }} />
                  <col style={{ width: '6.5%' }} />
                  <col style={{ width: '6.5%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '6.5%' }} />
                  <col style={{ width: '6.5%' }} />
                  <col style={{ width: '6.5%' }} />
                  <col style={{ width: '6.5%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={3}>Date of Working Days</th>
                    <th colSpan={2}>WORKING HOURS</th>
                    <th colSpan={4}>
                      OTHER BENEFITS
                      <br />
                      (Employer's Share)
                    </th>
                    <th rowSpan={3}>Daily Rate</th>
                    <th rowSpan={3}>
                      TOTAL
                      <br />
                      SALARY
                      <br />
                      EARNED
                    </th>
                    <th colSpan={4}>
                      DEDUCTIONS
                      <br />
                      (Employee's Share)
                    </th>
                    <th rowSpan={3}>
                      TOTAL
                      <br />
                      DEDUCTION
                    </th>
                    <th rowSpan={3}>
                      NET CASH
                      <br />
                      EARNED
                    </th>
                  </tr>
                  <tr>
                    <th rowSpan={2}>IN</th>
                    <th rowSpan={2}>OUT</th>
                    <th>SSS</th>
                    <th>PAG-IBIG</th>
                    <th>PHILHEALTH</th>
                    <th>TOTAL</th>
                    <th>SSS</th>
                    <th>PAG-IBIG</th>
                    <th>PHILHEALTH</th>
                    <th>Advance</th>
                  </tr>
                  <tr />
                </thead>
                <tbody>
                  {payslip.days.map((day) => {
                    const off = day.is_rest_day || day.is_holiday
                    return (
                      <tr key={day.id}>
                        <td className={off ? 'swtr-red' : undefined}>{dayLabel(day.work_date)}</td>
                        <td>{time12(day.time_in)}</td>
                        <td>{time12(day.time_out)}</td>
                        <td colSpan={4} />
                        <td className="num">{day.amount_earned ? money(payslip.daily_rate) : ''}</td>
                        <td className="num">{money(day.amount_earned)}</td>
                        <td colSpan={4} />
                        <td />
                        <td />
                      </tr>
                    )
                  })}
                  <tr className="swtr-totals">
                    <td>TOTAL</td>
                    <td colSpan={2}>{payslip.hours_worked ? `${payslip.hours_worked} hrs` : ''}</td>
                    <td className="num">{moneyOrDash(payslip.sss_employer)}</td>
                    <td className="num">{moneyOrDash(payslip.pagibig_employer)}</td>
                    <td className="num">{moneyOrDash(payslip.philhealth_employer)}</td>
                    <td className="num">{moneyOrDash(payslip.employer_share_total)}</td>
                    <td className="num">{money(payslip.daily_rate)}</td>
                    <td className="num">{money(payslip.gross_pay)}</td>
                    <td className="num">{moneyOrDash(payslip.sss_employee)}</td>
                    <td className="num">{moneyOrDash(payslip.pagibig_employee)}</td>
                    <td className="num">{moneyOrDash(payslip.philhealth_employee)}</td>
                    <td className="num">{moneyOrDash(payslip.advance)}</td>
                    <td className="num">{money(payslip.total_deductions)}</td>
                    <td className="num">{money(payslip.net_pay)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="swtr-cert">
                I certify that the above record of salaries and working time is true and correct, and
                that I had received the respective payments in full as specified above.
              </div>

              <div className="swtr-sigs">
                <div className="swtr-sig">
                  <div className="swtr-sigtitle">APPROVED:</div>
                  <div className="swtr-sigline" />
                  <div className="swtr-siglabel">SCHOOL ADMINISTRATOR</div>
                </div>
                <div className="swtr-sig">
                  <div className="swtr-sigtitle">PAID BY:</div>
                  <div className="swtr-sigline" />
                  <div className="swtr-siglabel">CASHIER</div>
                </div>
                <div className="swtr-sig">
                  <div className="swtr-sigtitle">RECEIVED BY:</div>
                  <div className="swtr-sigline" />
                  <div className="swtr-siglabel">SIGNATURE OF EMPLOYEE</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PayslipPrintModal
