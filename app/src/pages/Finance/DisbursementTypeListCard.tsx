import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { peso } from './disbursementFormat'

export interface TypeListRow {
  id: string
  name: string
  /** The default component type: renameable via the API, but never deletable. */
  locked?: boolean
}

interface DisbursementTypeListCardProps {
  icon: LucideIcon
  title: string
  description: string
  placeholder: string
  columnLabel: string
  emptyText: string
  rows: TypeListRow[]
  /** id → how many disbursements use it and their total. */
  usage: Record<string, { count: number; total: number }>
  mutationLoading: boolean
  onAdd: (name: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  deleteTitle: string
  deleteMessage: (name: string) => string
}

/**
 * One editable lookup list — used for both disbursement types (what the money
 * was for) and component types (how it was paid out), which differ only in
 * their copy and which disbursement field they are counted against.
 */
export function DisbursementTypeListCard({
  icon: Icon,
  title,
  description,
  placeholder,
  columnLabel,
  emptyText,
  rows,
  usage,
  mutationLoading,
  onAdd,
  onDelete,
  deleteTitle,
  deleteMessage,
}: DisbursementTypeListCardProps) {
  const [name, setName] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await onAdd(trimmed)
      setName('')
    } catch {
      // Error already toasted
    }
  }

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await onDelete(deleteTarget.id)
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
        <Icon className="w-5 h-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <p className="text-gray-600 mb-5">{description}</p>

      <form onSubmit={handleAdd} className="flex gap-2 mb-5 max-w-md">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
        <Button
          type="submit"
          disabled={mutationLoading || !name.trim()}
          className="flex items-center gap-1 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </form>

      <div className="overflow-x-auto max-w-2xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="pb-3 font-medium text-gray-700">{columnLabel}</th>
              <th className="pb-3 font-medium text-gray-700 text-right">Used by</th>
              <th className="pb-3 font-medium text-gray-700 text-right">Total</th>
              <th className="pb-3 font-medium text-gray-700 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const u = usage[row.id] ?? { count: 0, total: 0 }
                return (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-3 font-medium text-gray-900">
                      {row.name}
                      {row.locked && (
                        <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded-full bg-primary-50 text-primary-700 align-middle">
                          Default
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right text-gray-700">{u.count}</td>
                    <td className="py-3 text-right text-gray-700 whitespace-nowrap">{peso(u.total)}</td>
                    <td className="py-3 text-right">
                      {!row.locked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: row.id, name: row.name })}
                          className="text-gray-600 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
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
        title={deleteTitle}
        message={deleteTarget ? deleteMessage(deleteTarget.name) : ''}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
}
