import React, { useState, useEffect } from 'react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import type { Department } from '../../types'

interface DepartmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { title: string; slug?: string }) => void
  department: Department | null
  loading?: boolean
}

export function DepartmentModal({
  isOpen,
  onClose,
  onSubmit,
  department,
  loading = false,
}: DepartmentModalProps) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')

  useEffect(() => {
    if (isOpen) {
      if (department) {
        setTitle(department.title)
        setSlug(department.slug)
      } else {
        setTitle('')
        setSlug('')
      }
    }
  }, [isOpen, department])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), slug: slug.trim() || undefined })
  }

  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (!department) {
      setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {department ? 'Edit Department' : 'Add Department'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Elementary"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug (optional)</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. elementary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? 'Saving...' : department ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
