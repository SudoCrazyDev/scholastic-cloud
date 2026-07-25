import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import { useDisbursements } from '../../hooks/useDisbursements'
import { Loader2, Plus, Pencil, Trash2, Wallet, FileText, Settings2 } from 'lucide-react'
import { Button } from '../../components/button'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { DisbursementModal } from './DisbursementModal'
import { DisbursementTypeManagerModal } from './DisbursementTypeManagerModal'

const peso = (value: string | number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0)

const formatDate = (iso: string) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  // Build with explicit parts to avoid timezone day-shift.
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const Disbursements: React.FC = () => {
  const navigate = useNavigate()
  const { hasAccess } = useRoleAccess([
    'super-administrator',
    'principal',
    'institution-administrator',
    'finance',
  ])
  const {
    disbursements,
    types,
    users,
    isLoading,
    error,
    isModalOpen,
    editing,
    modalLoading,
    isTypeModalOpen,
    setIsTypeModalOpen,
    handleCreate,
    handleEdit,
    handleModalClose,
    handleModalSubmit,
    deleteDisbursement,
    createType,
    deleteType,
    typeMutationLoading,
  } = useDisbursements()

  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; title: string } | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!hasAccess) navigate('/dashboard')
  }, [hasAccess, navigate])

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

  if (!hasAccess) return null

  const total = disbursements.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Wallet className="w-7 h-7" />
              Disbursements
            </h1>
            <p className="text-gray-600 mt-1">
              Record and track expenses. Total shown: <span className="font-semibold">{peso(total)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsTypeModalOpen(true)} className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              Manage Types
            </Button>
            <Button onClick={handleCreate} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Disbursement
            </Button>
          </div>
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
                        {d.receipt_url ? (
                          <a
                            href={d.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary-600 hover:underline text-sm"
                          >
                            <FileText className="w-4 h-4" />
                            View
                          </a>
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
      </div>

      <DisbursementModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        disbursement={editing}
        types={types}
        users={users}
        loading={modalLoading}
        onManageTypes={() => setIsTypeModalOpen(true)}
      />

      <DisbursementTypeManagerModal
        isOpen={isTypeModalOpen}
        onClose={() => setIsTypeModalOpen(false)}
        types={types}
        onCreate={createType}
        onDelete={deleteType}
        loading={typeMutationLoading}
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
    </motion.div>
  )
}

export default Disbursements
