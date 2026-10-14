import React, { useMemo, useState } from 'react'
import { BlobProvider } from '@react-pdf/renderer'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { StudentBillingStatementPDF } from '../../components/StudentBillingStatementPDF'
import {
  buildBillingStatement,
  defaultBillingSequence,
} from '../../components/studentBillingStatement'
import { describeCoveredPeriods } from '../../components/studentNOAStatement'
import type { StudentNOAResponse } from '../../types'

interface BillingStatementModalProps {
  data: StudentNOAResponse
  institutionName?: string
  institutionAddress?: string
  logoUrl?: string | null
  defaultPreparedBy?: string
  onClose: () => void
}

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount || 0))

export const BillingStatementModal: React.FC<BillingStatementModalProps> = ({
  data,
  institutionName,
  institutionAddress,
  logoUrl,
  defaultPreparedBy,
  onClose,
}) => {
  const installments = useMemo(() => data.installments ?? [], [data.installments])
  const [sequence, setSequence] = useState<number | null>(() => defaultBillingSequence(data))
  const [preparedBy, setPreparedBy] = useState(defaultPreparedBy ?? '')

  const monthOptions = useMemo(
    () =>
      installments.map((installment) => ({
        value: String(installment.sequence),
        label: installment.label,
      })),
    [installments]
  )

  const statement = buildBillingStatement(data, sequence)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Billing Statement</h3>
          <p className="text-sm text-gray-500 mt-1">
            Every receipt issued this academic year, the remaining balance, and what is due for
            the month you choose.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {installments.length > 0 ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Billing month</label>
              <Select
                value={sequence != null ? String(sequence) : ''}
                onChange={(e) => setSequence(Number(e.target.value))}
                options={monthOptions}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              This student has no payment plan for this academic year, so the statement asks for
              the whole balance.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Prepared by</label>
            <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
          </div>

          {/* The figures the statement prints, so what is approved here is what is handed over. */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Receipts listed</span>
              <span className="tabular-nums">{statement.payments.length}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Total amount paid</span>
              <span className="tabular-nums">{formatCurrency(statement.totalPaid)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Balance for {data.academic_year}</span>
              <span className="tabular-nums">{formatCurrency(statement.balance)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5">
              <span>
                {statement.monthly
                  ? `Due for ${describeCoveredPeriods(statement.monthly)}`
                  : 'Amount due'}
              </span>
              <span className="tabular-nums">{formatCurrency(statement.amountDue)}</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {/* Remounted per selection so the blob is rebuilt for what is being printed. */}
          <BlobProvider
            key={`${sequence ?? 'all'}-${preparedBy}-${logoUrl ? 'logo' : 'nologo'}`}
            document={
              <StudentBillingStatementPDF
                data={data}
                institutionName={institutionName}
                institutionAddress={institutionAddress}
                logoUrl={logoUrl}
                installmentSequence={sequence}
                preparedBy={preparedBy.trim()}
              />
            }
          >
            {({ url, loading }) => (
              <Button
                type="button"
                disabled={loading || !url}
                onClick={() => url && window.open(url, '_blank')}
              >
                {loading ? 'Preparing...' : 'Open PDF'}
              </Button>
            )}
          </BlobProvider>
        </div>
      </div>
    </div>
  )
}

export default BillingStatementModal
