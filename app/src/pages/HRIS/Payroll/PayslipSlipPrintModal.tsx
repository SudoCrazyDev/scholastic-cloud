import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { payrollService } from '../../../services/payrollService'
import type { Payslip } from '../../../types'
import { PayslipSheet } from './PayslipSheet'
import { sheetDataFromPayslip } from './payslipSheetData'

interface PayslipSlipPrintModalProps {
  payslip: Payslip
  onClose: () => void
}

/**
 * Prints a payslip through one of the institution's designed templates
 * (default preselected). Templates are managed in the Payslip Designer tab.
 */
const PayslipSlipPrintModal: React.FC<PayslipSlipPrintModalProps> = ({ payslip, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [templateId, setTemplateId] = useState('')

  const templatesQuery = useQuery({
    queryKey: ['payslip-templates'],
    queryFn: () => payrollService.getPayslipTemplates(),
  })

  const templates = useMemo(() => templatesQuery.data?.data || [], [templatesQuery.data?.data])

  useEffect(() => {
    if (!templateId && templates.length > 0) {
      const preferred = templates.find((template) => template.is_default) || templates[0]
      setTemplateId(preferred.id)
    }
  }, [templates, templateId])

  const template = templates.find((item) => item.id === templateId)
  const data = useMemo(() => sheetDataFromPayslip(payslip), [payslip])

  const handlePrint = () => {
    if (!printRef.current) return
    const printWindow = window.open('', '_blank', 'width=600,height=700')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Pay Slip — ${payslip.staff_name}</title></head>
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
        className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Pay Slip</h3>
          <div className="flex items-center gap-2">
            {templates.length > 1 && (
              <div className="w-48">
                <Select
                  inputSize="sm"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  options={templates.map((item) => ({
                    value: item.id,
                    label: item.is_default ? `${item.name} (default)` : item.name,
                  }))}
                />
              </div>
            )}
            <Button type="button" size="sm" onClick={handlePrint} disabled={!template}>
              Print
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="p-6">
          {templatesQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading templates…</p>
          ) : !template ? (
            <div className="py-8 text-center">
              <p className="mb-3 text-sm text-gray-500">
                No payslip template yet. Design one first in the Payslip Designer tab.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onClose()
                  navigate('/hris/payroll')
                }}
              >
                Open Payslip Designer
              </Button>
            </div>
          ) : (
            <>
              <div ref={printRef}>
                <PayslipSheet layout={template.layout || []} data={data} />
              </div>
              <p className="mt-3 text-center text-xs text-gray-400">
                Using template: {template.name}
                {template.is_default ? ' (default)' : ''}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PayslipSlipPrintModal
