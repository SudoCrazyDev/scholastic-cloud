import React, { useState, useEffect } from 'react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Textarea } from '../../components/textarea'
import { Select } from '../../components/select'
import { FileText, X } from 'lucide-react'
import type { Disbursement, DisbursementType, DisbursementFormData, User } from '../../types'

interface DisbursementModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: DisbursementFormData) => void
  disbursement: Disbursement | null
  types: DisbursementType[]
  users: User[]
  loading?: boolean
}

function userLabel(u: User): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
  return name || u.email || 'Unnamed user'
}

const today = () => new Date().toISOString().split('T')[0]

export function DisbursementModal({
  isOpen,
  onClose,
  onSubmit,
  disbursement,
  types,
  users,
  loading = false,
}: DisbursementModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [typeId, setTypeId] = useState('')
  const [dateIssued, setDateIssued] = useState(today())
  const [inChargeId, setInChargeId] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (disbursement) {
      setTitle(disbursement.title)
      setDescription(disbursement.description ?? '')
      setAmount(String(disbursement.amount ?? ''))
      setTypeId(disbursement.disbursement_type_id ?? '')
      setDateIssued(disbursement.date_issued ?? today())
      setInChargeId(disbursement.in_charge_user_id ?? '')
    } else {
      setTitle('')
      setDescription('')
      setAmount('')
      setTypeId('')
      setDateIssued(today())
      setInChargeId('')
    }
    setReceipt(null)
    setRemoveReceipt(false)
  }, [isOpen, disbursement])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || amount === '' || !dateIssued) return
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      amount: Number(amount),
      date_issued: dateIssued,
      disbursement_type_id: typeId || null,
      in_charge_user_id: inChargeId || null,
      receipt: receipt || undefined,
      remove_receipt: removeReceipt,
    })
  }

  if (!isOpen) return null

  const existingReceipt = disbursement?.receipt_url && !removeReceipt && !receipt

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {disbursement ? 'Edit Disbursement' : 'Record Disbursement'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Electric bill — July"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Issued</label>
              <Input
                type="date"
                value={dateIssued}
                onChange={(e) => setDateIssued(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <Select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              placeholder="Select a type"
              options={types.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">In-Charge of (optional)</label>
            <Select
              value={inChargeId}
              onChange={(e) => setInChargeId(e.target.value)}
              placeholder="Not assigned"
              options={users.map((u) => ({ value: u.id, label: userLabel(u) }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Receipt (optional)</label>
            {existingReceipt ? (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <a
                  href={disbursement!.receipt_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline truncate"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">{disbursement!.receipt_name || 'View current receipt'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setRemoveReceipt(true)}
                  className="text-gray-400 hover:text-red-600"
                  title="Remove receipt"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
              />
            )}
            {removeReceipt && disbursement?.receipt_url && (
              <p className="mt-1 text-xs text-gray-500">
                Current receipt will be removed on save.{' '}
                <button type="button" className="text-primary-600 hover:underline" onClick={() => setRemoveReceipt(false)}>
                  Undo
                </button>
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !title.trim() || amount === '' || !dateIssued}>
              {loading ? 'Saving...' : disbursement ? 'Update' : 'Record'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
