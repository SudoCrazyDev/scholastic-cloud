import React from 'react'
import { Loader2, Plus, Pencil, Trash2, FileText } from 'lucide-react'
import { Button } from '../../components/button'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { DisbursementModal } from './DisbursementModal'
import { peso, formatDate } from './disbursementFormat'
import type { useDisbursements } from '../../hooks/useDisbursements'

type Dm = ReturnType<typeof useDisbursements>

export function DisbursementsListTab({ dm }: { dm: Dm }) {
  const {
    disbursements,
    types,
    users,
    isLoading,
    error,
    isModalOpen,
    editing,
    modalLoading,
    handleCreate,
    handleEdit,
    handleModalClose,
    handleModalSubmit,
    deleteDisbursement,
  } = dm

  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; title: string } | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteDisbursement(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error already toasted
    } finally {
      setIsDeleting(false)
    }
  }

  const total = disbursements.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-gray-600">
          {disbursements.length} record{disbursements.length === 1 ? '' : 's'} · Total{' '}
          <span className="font-semibold text-gray-900">{peso(total)}</span>
        </p>
        <Button onClick={handleCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Disbursement
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {String((error as any)?.message || error)}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-3 font-medium text-gray-700">Date</th>
                <th className="pb-3 font-medium text-gray-700">Title</th>
                <th className="pb-3 font-medium text-gray-700">Type</th>
                <th className="pb-3 font-medium text-gray-700 text-right">Amount</th>
                <th className="pb-3 font-medium text-gray-700">In-Charge</th>
                <th className="pb-3 font-medium text-gray-700">Receipt</th>
                <th className="pb-3 font-medium text-gray-700 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {disbursements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    No disbursements yet. Add one to get started.
                  </td>
                </tr>
              ) : (
                disbursements.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50/50 align-top">
                    <td className="py-3 whitespace-nowrap text-gray-700">{formatDate(d.date_issued)}</td>
                    <td className="py-3">
                      <div className="font-medium text-gray-900">{d.title}</div>
                      {d.description && (
                        <div className="text-sm text-gray-500 max-w-xs truncate">{d.description}</div>
                      )}
                    </td>
                    <td className="py-3">
                      {d.type_name ? (
                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                          {d.type_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {peso(d.amount)}
                    </td>
                    <td className="py-3 text-gray-700">{d.in_charge_name || <span className="text-gray-400">—</span>}</td>
                    <td className="py-3">
                      {d.receipts.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {d.receipts.map((r, i) => (
                            <a
                              key={r.id}
                              href={r.url ?? '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary-600 hover:underline text-sm"
                              title={r.name ?? undefined}
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              {d.receipts.length > 1 ? `View ${i + 1}` : 'View'}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(d)}
                        className="text-gray-600 hover:text-primary-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget({ id: d.id, title: d.title })}
                        className="text-gray-600 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <DisbursementModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        disbursement={editing}
        types={types}
        users={users}
        loading={modalLoading}
      />

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDeleteConfirm}
        title="Delete Disbursement"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.title}"? This cannot be undone.`
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
