import React from 'react'
import { Plus, Trash2, Tags } from 'lucide-react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { peso } from './disbursementFormat'
import type { useDisbursements } from '../../hooks/useDisbursements'

type Dm = ReturnType<typeof useDisbursements>

export function DisbursementTypesTab({ dm }: { dm: Dm }) {
  const { types, disbursements, createType, deleteType, typeMutationLoading } = dm
  const [name, setName] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Usage counts per type, derived from the current disbursement list.
  const usage = React.useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {}
    for (const d of disbursements) {
      if (!d.disbursement_type_id) continue
      const entry = map[d.disbursement_type_id] ?? { count: 0, total: 0 }
      entry.count += 1
      entry.total += Number(d.amount) || 0
      map[d.disbursement_type_id] = entry
    }
    return map
  }, [disbursements])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await createType(trimmed)
      setName('')
    } catch {
      // Error already toasted
    }
  }

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteType(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error already toasted
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Tags className="w-5 h-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Disbursement Types</h2>
      </div>
      <p className="text-gray-600 mb-5">
        Create the categories used when recording disbursements. Deleting a type keeps existing
        records — they simply show no type.
      </p>

      <form onSubmit={handleAdd} className="flex gap-2 mb-5 max-w-md">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Utilities, Supplies, Salaries"
        />
        <Button type="submit" disabled={typeMutationLoading || !name.trim()} className="flex items-center gap-1 shrink-0">
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </form>

      <div className="overflow-x-auto max-w-2xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="pb-3 font-medium text-gray-700">Type</th>
              <th className="pb-3 font-medium text-gray-700 text-right">Used by</th>
              <th className="pb-3 font-medium text-gray-700 text-right">Total</th>
              <th className="pb-3 font-medium text-gray-700 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {types.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  No types yet. Add one above.
                </td>
              </tr>
            ) : (
              types.map((t) => {
                const u = usage[t.id] ?? { count: 0, total: 0 }
                return (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-3 font-medium text-gray-900">{t.name}</td>
                    <td className="py-3 text-right text-gray-700">{u.count}</td>
                    <td className="py-3 text-right text-gray-700 whitespace-nowrap">{peso(u.total)}</td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                        className="text-gray-600 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDeleteConfirm}
        title="Delete Type"
        message={
          deleteTarget
            ? `Delete the type "${deleteTarget.name}"? Existing disbursements using it will keep their records but show no type.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
}
