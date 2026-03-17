import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import { trackService } from '../../services/trackService'
import { strandService } from '../../services/strandService'
import { Loader2, Plus, Pencil, Trash2, Route, Layers } from 'lucide-react'
import { Button } from '../../components/button'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { TrackModal } from './TrackModal'
import { StrandModal } from './StrandModal'
import type { Track, Strand } from '../../types'

const TracksStrands: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasAccess } = useRoleAccess(['principal', 'institution-administrator'])

  // Track state
  const [trackModalOpen, setTrackModalOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [deleteTrackTarget, setDeleteTrackTarget] = useState<{ id: string; title: string } | null>(null)
  const [isDeletingTrack, setIsDeletingTrack] = useState(false)

  // Strand state
  const [strandModalOpen, setStrandModalOpen] = useState(false)
  const [editingStrand, setEditingStrand] = useState<Strand | null>(null)
  const [deleteStrandTarget, setDeleteStrandTarget] = useState<{ id: string; title: string } | null>(null)
  const [isDeletingStrand, setIsDeletingStrand] = useState(false)

  React.useEffect(() => {
    if (!hasAccess) navigate('/dashboard')
  }, [hasAccess, navigate])

  // Queries
  const { data: tracksResponse, isLoading: tracksLoading } = useQuery({
    queryKey: ['tracks'],
    queryFn: () => trackService.getTracks(),
    enabled: hasAccess,
  })
  const tracks: Track[] = tracksResponse?.data ?? []

  const { data: strandsResponse, isLoading: strandsLoading } = useQuery({
    queryKey: ['strands'],
    queryFn: () => strandService.getStrands(),
    enabled: hasAccess,
  })
  const strands: Strand[] = strandsResponse?.data ?? []

  // Track mutations
  const createTrack = useMutation({
    mutationFn: (data: { title: string; slug?: string }) => trackService.createTrack(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      setTrackModalOpen(false)
      setEditingTrack(null)
      toast.success('Track created')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create track'),
  })

  const updateTrack = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; slug?: string } }) =>
      trackService.updateTrack(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.invalidateQueries({ queryKey: ['strands'] })
      setTrackModalOpen(false)
      setEditingTrack(null)
      toast.success('Track updated')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update track'),
  })

  const deleteTrack = useMutation({
    mutationFn: (id: string) => trackService.deleteTrack(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.invalidateQueries({ queryKey: ['strands'] })
      toast.success('Track deleted')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete track'),
  })

  // Strand mutations
  const createStrand = useMutation({
    mutationFn: (data: { track_id: string; title: string; slug?: string }) =>
      strandService.createStrand(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strands'] })
      setStrandModalOpen(false)
      setEditingStrand(null)
      toast.success('Strand created')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create strand'),
  })

  const updateStrand = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { track_id?: string; title?: string; slug?: string } }) =>
      strandService.updateStrand(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strands'] })
      setStrandModalOpen(false)
      setEditingStrand(null)
      toast.success('Strand updated')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update strand'),
  })

  const deleteStrandMutation = useMutation({
    mutationFn: (id: string) => strandService.deleteStrand(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strands'] })
      toast.success('Strand deleted')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete strand'),
  })

  // Track handlers
  const handleTrackSubmit = (data: { title: string; slug?: string }) => {
    if (editingTrack) {
      updateTrack.mutate({ id: editingTrack.id, data })
    } else {
      createTrack.mutate(data)
    }
  }

  const onDeleteTrackConfirm = async () => {
    if (!deleteTrackTarget) return
    setIsDeletingTrack(true)
    try {
      await deleteTrack.mutateAsync(deleteTrackTarget.id)
      setDeleteTrackTarget(null)
    } catch { /* handled */ } finally {
      setIsDeletingTrack(false)
    }
  }

  // Strand handlers
  const handleStrandSubmit = (data: { track_id: string; title: string; slug?: string }) => {
    if (editingStrand) {
      updateStrand.mutate({ id: editingStrand.id, data })
    } else {
      createStrand.mutate(data)
    }
  }

  const onDeleteStrandConfirm = async () => {
    if (!deleteStrandTarget) return
    setIsDeletingStrand(true)
    try {
      await deleteStrandMutation.mutateAsync(deleteStrandTarget.id)
      setDeleteStrandTarget(null)
    } catch { /* handled */ } finally {
      setIsDeletingStrand(false)
    }
  }

  if (!hasAccess) return null

  const trackModalLoading = createTrack.isPending || updateTrack.isPending
  const strandModalLoading = createStrand.isPending || updateStrand.isPending

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Route className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tracks & Strands</h1>
            <p className="text-sm text-gray-600">
              Manage SHS tracks and strands. Tracks group related strands (e.g. Academic, TVL). Strands are specializations within a track (e.g. STEM, ABM).
            </p>
          </div>
        </div>
      </div>

      {/* Tracks Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">Tracks</h2>
            <span className="text-sm text-gray-500">({tracks.length})</span>
          </div>
          <Button
            onClick={() => { setEditingTrack(null); setTrackModalOpen(true) }}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Track
          </Button>
        </div>

        {tracksLoading ? (
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
                  <th className="pb-3 font-medium text-gray-700">Strands</th>
                  <th className="pb-3 font-medium text-gray-700 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tracks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      No tracks yet. Add one to get started.
                    </td>
                  </tr>
                ) : (
                  tracks.map((t) => {
                    const trackStrands = strands.filter(s => s.track_id === t.id)
                    return (
                      <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-3 font-medium text-gray-900">{t.title}</td>
                        <td className="py-3">
                          <code className="px-2 py-0.5 text-sm bg-gray-100 text-gray-700 rounded">
                            {t.slug}
                          </code>
                        </td>
                        <td className="py-3">
                          {trackStrands.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {trackStrands.map(s => (
                                <span key={s.id} className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                                  {s.title}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">None</span>
                          )}
                        </td>
                        <td className="py-3 flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingTrack(t); setTrackModalOpen(true) }}
                            className="text-gray-600 hover:text-indigo-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTrackTarget({ id: t.id, title: t.title })}
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
        )}
      </div>

      {/* Strands Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">Strands</h2>
            <span className="text-sm text-gray-500">({strands.length})</span>
          </div>
          <Button
            onClick={() => { setEditingStrand(null); setStrandModalOpen(true) }}
            disabled={tracks.length === 0}
            className="flex items-center gap-2"
            title={tracks.length === 0 ? 'Create a track first' : undefined}
          >
            <Plus className="w-4 h-4" />
            Add Strand
          </Button>
        </div>

        {strandsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : tracks.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            Create a track first before adding strands.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-3 font-medium text-gray-700">Title</th>
                  <th className="pb-3 font-medium text-gray-700">Slug</th>
                  <th className="pb-3 font-medium text-gray-700">Track</th>
                  <th className="pb-3 font-medium text-gray-700 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {strands.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      No strands yet. Add one to get started.
                    </td>
                  </tr>
                ) : (
                  strands.map((s) => {
                    const parentTrack = tracks.find(t => t.id === s.track_id)
                    return (
                      <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-3 font-medium text-gray-900">{s.title}</td>
                        <td className="py-3">
                          <code className="px-2 py-0.5 text-sm bg-gray-100 text-gray-700 rounded">
                            {s.slug}
                          </code>
                        </td>
                        <td className="py-3">
                          {parentTrack ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                              <Route className="w-3 h-3" />
                              {parentTrack.title}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Unknown</span>
                          )}
                        </td>
                        <td className="py-3 flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingStrand(s); setStrandModalOpen(true) }}
                            className="text-gray-600 hover:text-indigo-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteStrandTarget({ id: s.id, title: s.title })}
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
        )}
      </div>

      {/* Modals */}
      <TrackModal
        isOpen={trackModalOpen}
        onClose={() => { setTrackModalOpen(false); setEditingTrack(null) }}
        onSubmit={handleTrackSubmit}
        track={editingTrack}
        loading={trackModalLoading}
      />

      <StrandModal
        isOpen={strandModalOpen}
        onClose={() => { setStrandModalOpen(false); setEditingStrand(null) }}
        onSubmit={handleStrandSubmit}
        strand={editingStrand}
        tracks={tracks}
        loading={strandModalLoading}
      />

      <ConfirmationModal
        isOpen={!!deleteTrackTarget}
        onClose={() => setDeleteTrackTarget(null)}
        onConfirm={onDeleteTrackConfirm}
        title="Delete Track"
        message={
          deleteTrackTarget
            ? `Are you sure you want to delete "${deleteTrackTarget.title}"? All strands under this track will also be deleted, and sections linked to this track will have their track cleared.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeletingTrack}
      />

      <ConfirmationModal
        isOpen={!!deleteStrandTarget}
        onClose={() => setDeleteStrandTarget(null)}
        onConfirm={onDeleteStrandConfirm}
        title="Delete Strand"
        message={
          deleteStrandTarget
            ? `Are you sure you want to delete "${deleteStrandTarget.title}"? Sections linked to this strand will have their strand cleared.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeletingStrand}
      />
    </motion.div>
  )
}

export default TracksStrands
