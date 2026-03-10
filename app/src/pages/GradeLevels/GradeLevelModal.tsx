import React, { useState, useEffect } from 'react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import type { GradeLevel } from '../../types'

interface GradeLevelModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { title: string; sort_order: number }) => void
  gradeLevel: GradeLevel | null
  loading?: boolean
}

export function GradeLevelModal({
  isOpen,
  onClose,
  onSubmit,
  gradeLevel,
  loading = false,
}: GradeLevelModalProps) {
  const [title, setTitle] = useState('')
  const [sortOrder, setSortOrder] = useState<number>(0)

  useEffect(() => {
    if (isOpen) {
      if (gradeLevel) {
        setTitle(gradeLevel.title)
        setSortOrder(gradeLevel.sort_order)
      } else {
        setTitle('')
        setSortOrder(0)
      }
    }
  }, [isOpen, gradeLevel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), sort_order: sortOrder })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {gradeLevel ? 'Edit Grade Level' : 'Add Grade Level'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Grade 1, Kinder 1"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort order</label>
            <Input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? 'Saving...' : gradeLevel ? 'Update' : 'Add'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
