import React, { useState } from 'react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import type { DisbursementType } from '../../types'

interface DisbursementTypeManagerModalProps {
  isOpen: boolean
  onClose: () => void
  types: DisbursementType[]
  onCreate: (name: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  loading?: boolean
}

export function DisbursementTypeManagerModal({
  isOpen,
  onClose,
  types,
  onCreate,
  onDelete,
  loading = false,
}: DisbursementTypeManagerModalProps) {
  const [name, setName] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await onCreate(trimmed)
      setName('')
    } catch {
      // Error already toasted
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Disbursement Types</h2>

        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New type name"
            autoFocus
          />
          <Button type="submit" disabled={loading || !name.trim()} className="flex items-center gap-1 shrink-0">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </form>

        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {types.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No types yet. Add one above.</p>
          ) : (
            types.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm text-gray-800">{t.name}</span>
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  disabled={loading}
                  className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                  title="Delete type"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Deleting a type keeps existing disbursements; they will simply show no type.
        </p>

        <div className="flex justify-end pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  )
}
