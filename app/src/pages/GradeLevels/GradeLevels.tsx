import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import { useGradeLevels, useGradeLevelMutations } from '../../hooks/useGradeLevels'
import { Loader2, Plus, Pencil, Trash2, GraduationCap } from 'lucide-react'
import { Button } from '../../components/button'
import { GradeLevelModal } from './GradeLevelModal'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import type { GradeLevel } from '../../types'

const GradeLevels: React.FC = () => {
  const navigate = useNavigate()
  const { hasAccess } = useRoleAccess(['super-administrator'])
  const { gradeLevels, loading, error } = useGradeLevels()
  const { createMutation, updateMutation, deleteMutation } = useGradeLevelMutations()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingGradeLevel, setEditingGradeLevel] = useState<GradeLevel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

  React.useEffect(() => {
    if (!hasAccess) navigate('/dashboard')
  }, [hasAccess, navigate])

  const handleCreate = () => {
    setEditingGradeLevel(null)
    setIsModalOpen(true)
  }

  const handleEdit = (gl: GradeLevel) => {
    setEditingGradeLevel(gl)
    setIsModalOpen(true)
  }

  const handleModalSubmit = (data: { title: string; sort_order: number }) => {
    if (editingGradeLevel) {
      updateMutation.mutate({ id: editingGradeLevel.id, data })
    } else {
      createMutation.mutate(data)
    }
    setIsModalOpen(false)
    setEditingGradeLevel(null)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingGradeLevel(null)
  }

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error already toasted
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
              <GraduationCap className="w-7 h-7" />
              Grade Levels
            </h1>
            <p className="text-gray-600 mt-1">
              Manage grade levels (Kinder 1, Kinder 2, Grade 1–12). Used in class sections and reports. Only Super Administrators can edit.
            </p>
          </div>
          <Button onClick={handleCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Grade Level
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {String(error)}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-3 font-medium text-gray-700">Title</th>
                  <th className="pb-3 font-medium text-gray-700 w-24">Order</th>
                  <th className="pb-3 font-medium text-gray-700 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {gradeLevels.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-500">
                      No grade levels yet. Add Kinder 1, Kinder 2, Grade 1–12, or run the seeder.
                    </td>
                  </tr>
                ) : (
                  gradeLevels.map((gl) => (
                    <tr key={gl.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-3 font-medium text-gray-900">{gl.title}</td>
                      <td className="py-3 text-gray-600">{gl.sort_order}</td>
                      <td className="py-3 flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(gl)}
                          className="text-gray-600 hover:text-indigo-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: gl.id, title: gl.title })}
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

      <GradeLevelModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        gradeLevel={editingGradeLevel}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Grade Level"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.title}"? This may affect class sections that use this grade level.`
            : ''
        }
        onConfirm={onDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </motion.div>
  )
}

export default GradeLevels
