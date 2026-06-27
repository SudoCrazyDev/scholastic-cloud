import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import { useGradingScales, useGradingScaleMutations } from '../../hooks/useGradingScales'
import { Loader2, Plus, Pencil, Trash2, ListChecks } from 'lucide-react'
import { Button } from '../../components/button'
import { GradingScaleModal } from './GradingScaleModal'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import type { GradingScale, CreateGradingScaleData } from '../../types'

const GradingScales: React.FC = () => {
  const navigate = useNavigate()
  const { hasAccess } = useRoleAccess(['super-administrator', 'principal', 'institution-administrator'])
  const { gradingScales, loading, error } = useGradingScales()
  const { createMutation, updateMutation, deleteMutation } = useGradingScaleMutations()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<GradingScale | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  React.useEffect(() => {
    if (!hasAccess) navigate('/dashboard')
  }, [hasAccess, navigate])

  const handleCreate = () => {
    setEditing(null)
    setIsModalOpen(true)
  }

  const handleEdit = (scale: GradingScale) => {
    setEditing(scale)
    setIsModalOpen(true)
  }

  const handleModalSubmit = (data: CreateGradingScaleData) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data })
    } else {
      createMutation.mutate(data)
    }
    setIsModalOpen(false)
    setEditing(null)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditing(null)
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
              <ListChecks className="w-7 h-7" />
              Grading Scales
            </h1>
            <p className="text-gray-600 mt-1">
              Define non-numerical scoring scales (e.g. A = 95–100, A- = 90–94). Assign a scale to a
              subject set to <span className="font-medium">Non-Numerical</span> grading.
            </p>
          </div>
          <Button onClick={handleCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Grading Scale
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{String(error)}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : gradingScales.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            No grading scales yet. Add one to use with non-numerical subjects.
          </div>
        ) : (
          <div className="space-y-4">
            {gradingScales.map((scale) => (
              <div key={scale.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{scale.name}</h3>
                    {scale.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{scale.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(scale)}
                      className="text-gray-600 hover:text-indigo-600"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget({ id: scale.id, name: scale.name })}
                      className="text-gray-600 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {scale.bands.map((band, i) => (
                    <span
                      key={band.id ?? i}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700"
                    >
                      <span className="font-semibold">{band.label}</span>
                      <span className="text-gray-400">·</span>
                      <span>
                        {Number(band.min_score)}–{Number(band.max_score)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <GradingScaleModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        gradingScale={editing}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Grading Scale"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? Subjects using this scale will fall back to no scale.`
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

export default GradingScales
