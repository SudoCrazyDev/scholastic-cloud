import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import { useDepartments } from '../../hooks/useDepartments'
import { Loader2, Plus, Pencil, Trash2, Building2 } from 'lucide-react'
import { Button } from '../../components/button'
import { DepartmentModal } from './DepartmentModal'
import { ConfirmationModal } from '../../components/ConfirmationModal'

const Departments: React.FC = () => {
  const navigate = useNavigate()
  const { hasAccess } = useRoleAccess(['principal', 'institution-administrator'])
  const {
    departments,
    isLoading,
    error,
    isModalOpen,
    editingDepartment,
    modalLoading,
    handleCreate,
    handleEdit,
    handleModalSubmit,
    handleModalClose,
    deleteDepartment,
  } = useDepartments()

  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; title: string } | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!hasAccess) navigate('/dashboard')
  }, [hasAccess, navigate])

  const onDeleteClick = (id: string, title: string) => setDeleteTarget({ id, title })
  const onDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteDepartment(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error already toasted
    } finally {
      setIsDeleting(false)
    }
  }

  if (!hasAccess) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-7 h-7" />
              Departments
            </h1>
            <p className="text-gray-600 mt-1">
              Manage departments. School days and sections can be set per department. Set a default department in Settings.
            </p>
          </div>
          <Button onClick={handleCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Department
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {String(error)}
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
                  <th className="pb-3 font-medium text-gray-700">Title</th>
                  <th className="pb-3 font-medium text-gray-700">Slug</th>
                  <th className="pb-3 font-medium text-gray-700 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-500">
                      No departments yet. Add one to get started.
                    </td>
                  </tr>
                ) : (
                  departments.map((d) => (
                    <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-3 font-medium text-gray-900">{d.title}</td>
                      <td className="py-3">
                        <code className="px-2 py-0.5 text-sm bg-gray-100 text-gray-700 rounded">
                          {d.slug}
                        </code>
                      </td>
                      <td className="py-3 flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(d)}
                          className="text-gray-600 hover:text-indigo-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteClick(d.id, d.title)}
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

      <DepartmentModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        department={editingDepartment}
        loading={modalLoading}
      />

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDeleteConfirm}
        title="Delete Department"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.title}"? Sections and school days linked to this department will have their department cleared.`
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

export default Departments
