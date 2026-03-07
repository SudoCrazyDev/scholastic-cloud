import React, { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/button'
import { receiptTemplateService } from '../../services/receiptTemplateService'
import type { StudentPayment, ReceiptTemplateElement } from '../../types'

interface ReceiptPrintModalProps {
  payment: StudentPayment
  studentName: string
  studentLrn?: string
  onClose: () => void
}

function ReceiptElement({ element, payment, studentName, studentLrn }: {
  element: ReceiptTemplateElement
  payment: StudentPayment
  studentName: string
  studentLrn?: string
}) {
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount)

  switch (element.type) {
    case 'institution_logo':
      return <div className="w-14 h-14 bg-gray-200 rounded mx-auto flex items-center justify-center text-xs text-gray-400 print:bg-gray-100">Logo</div>
    case 'institution_name':
      return <p className="text-center font-bold text-base">Institution</p>
    case 'institution_address':
      return <p className="text-center text-xs text-gray-500" />
    case 'receipt_number':
      return <p className="text-sm"><span className="font-medium">Receipt #:</span> {payment.receipt_number || payment.id}</p>
    case 'payment_date':
      return <p className="text-sm"><span className="font-medium">Date:</span> {payment.payment_date}</p>
    case 'student_name':
      return <p className="text-sm"><span className="font-medium">Student:</span> {studentName}</p>
    case 'student_lrn':
      return <p className="text-sm"><span className="font-medium">LRN:</span> {studentLrn || 'N/A'}</p>
    case 'grade_level':
      return <p className="text-sm"><span className="font-medium">Grade:</span> {payment.academic_year}</p>
    case 'academic_year':
      return <p className="text-sm"><span className="font-medium">S.Y.:</span> {payment.academic_year}</p>
    case 'fee_name':
      return <p className="text-sm"><span className="font-medium">Fee:</span> {payment.school_fee?.name || 'General'}</p>
    case 'payment_amount':
      return <p className="text-lg font-bold text-center">{formatAmount(Number(payment.amount))}</p>
    case 'payment_method':
      return <p className="text-sm"><span className="font-medium">Method:</span> {payment.payment_method || 'N/A'}</p>
    case 'received_by':
      return <p className="text-sm"><span className="font-medium">Received by:</span> Cashier</p>
    case 'divider':
      return <hr className="border-dashed border-gray-400 my-2" />
    case 'custom_text':
      return <p className="text-sm text-center">{element.content || ''}</p>
    case 'signature_line':
      return (
        <div className="pt-8 text-center">
          <div className="border-t border-gray-400 w-40 mx-auto" />
          <p className="text-xs text-gray-500 mt-1">Signature</p>
        </div>
      )
    case 'spacer':
      return <div className="h-4" />
    default:
      return null
  }
}

const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  payment,
  studentName,
  studentLrn,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null)

  const templatesQuery = useQuery({
    queryKey: ['receipt-templates'],
    queryFn: () => receiptTemplateService.getTemplates(),
  })

  const templates = templatesQuery.data?.data || []
  const defaultTemplate = templates.find((t) => t.is_default) || templates[0]

  const handlePrint = () => {
    if (!printRef.current) return
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Receipt</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 16px; }
        .receipt { max-width: 300px; margin: 0 auto; }
        p { margin: 2px 0; }
        hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
        .bold { font-weight: bold; }
        .center { text-align: center; }
        .amount { font-size: 18px; font-weight: bold; text-align: center; margin: 8px 0; }
        .sig { padding-top: 32px; text-align: center; }
        .sig-line { border-top: 1px solid #666; width: 160px; margin: 0 auto; }
        .sig-label { font-size: 11px; color: #666; margin-top: 4px; }
        .small { font-size: 12px; }
        .logo { width: 56px; height: 56px; background: #eee; border-radius: 4px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #999; }
        .spacer { height: 16px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <div class="receipt">${printRef.current.innerHTML}</div>
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
      </body></html>
    `)
    printWindow.document.close()
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Payment Receipt</h3>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handlePrint}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Print Receipt
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="p-6">
          <div
            ref={printRef}
            className="border border-gray-300 rounded-lg p-6 bg-white max-w-[300px] mx-auto"
          >
            {defaultTemplate && defaultTemplate.layout?.length > 0 ? (
              <div className="space-y-1">
                {defaultTemplate.layout.map((el) => (
                  <ReceiptElement
                    key={el.id}
                    element={el}
                    payment={payment}
                    studentName={studentName}
                    studentLrn={studentLrn}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-center font-bold text-base">Payment Receipt</p>
                <hr className="border-dashed border-gray-400" />
                <p><span className="font-medium">Receipt #:</span> {payment.receipt_number || payment.id}</p>
                <p><span className="font-medium">Date:</span> {payment.payment_date}</p>
                <p><span className="font-medium">Student:</span> {studentName}</p>
                {studentLrn && <p><span className="font-medium">LRN:</span> {studentLrn}</p>}
                <p><span className="font-medium">S.Y.:</span> {payment.academic_year}</p>
                {payment.school_fee?.name && <p><span className="font-medium">Fee:</span> {payment.school_fee.name}</p>}
                <hr className="border-dashed border-gray-400" />
                <p className="text-lg font-bold text-center">{formatAmount(Number(payment.amount))}</p>
                {payment.payment_method && <p><span className="font-medium">Method:</span> {payment.payment_method}</p>}
                <hr className="border-dashed border-gray-400" />
                <div className="pt-8 text-center">
                  <div className="border-t border-gray-400 w-40 mx-auto" />
                  <p className="text-xs text-gray-500 mt-1">Authorized Signature</p>
                </div>
              </div>
            )}
          </div>

          {!defaultTemplate && (
            <p className="text-xs text-gray-400 text-center mt-3">
              No receipt template found. Using default layout. Create one in Receipt Builder.
            </p>
          )}
          {defaultTemplate && (
            <p className="text-xs text-gray-400 text-center mt-3">
              Using template: {defaultTemplate.name}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReceiptPrintModal
