import React, { useState, useEffect } from 'react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import type { Track, Strand } from '../../types'

interface StrandModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { track_id: string; title: string; slug?: string }) => void
  strand: Strand | null
  tracks: Track[]
  loading?: boolean
}

export function StrandModal({
  isOpen,
  onClose,
  onSubmit,
  strand,
  tracks,
  loading = false,
}: StrandModalProps) {
  const [trackId, setTrackId] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')

  useEffect(() => {
    if (isOpen) {
      if (strand) {
        setTrackId(strand.track_id)
        setTitle(strand.title)
        setSlug(strand.slug)
      } else {
        setTrackId(tracks.length === 1 ? tracks[0].id : '')
        setTitle('')
        setSlug('')
      }
    }
  }, [isOpen, strand, tracks])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !trackId) return
    onSubmit({ track_id: trackId, title: title.trim(), slug: slug.trim() || undefined })
  }

  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (!strand) {
      setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {strand ? 'Edit Strand' : 'Add Strand'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Track *</label>
            <Select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              options={[
                { value: '', label: 'Select a track' },
                ...tracks.map(t => ({ value: t.id, label: t.title })),
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. STEM"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug (optional)</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. stem"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !title.trim() || !trackId}>
              {loading ? 'Saving...' : strand ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
