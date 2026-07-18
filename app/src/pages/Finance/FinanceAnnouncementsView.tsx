import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSquareIcon, TrashIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import { Pin, Paperclip, Megaphone } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { announcementService } from '../../services/announcementService'
import RichTextEditor from '../AssignedSubjects/components/RichTextEditor'
import type { Announcement, AnnouncementStatus, CreateAnnouncementData } from '../../types'

interface FormState {
  title: string
  body: string
  is_pinned: boolean
  status: AnnouncementStatus
  publish_at: string
  expires_at: string
}

const emptyForm = (): FormState => ({
  title: '',
  body: '',
  is_pinned: false,
  status: 'published',
  publish_at: '',
  expires_at: '',
})

const errorMessage = (err: unknown, fallback: string): string => {
  const response = (err as { response?: { data?: { message?: string } } })?.response
  return response?.data?.message || fallback
}

const pad = (n: number) => String(n).padStart(2, '0')

// ISO string -> value for <input type="datetime-local">
const toLocalInput = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const formatDate = (value: string | null): string => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

type ComputedStatus = 'draft' | 'expired' | 'scheduled' | 'published'

// The status label shown in the list — mirrors the visibility rules: draft is never
// live; a published row is "scheduled" until publish_at, "expired" after expires_at.
const computedStatus = (a: Announcement): ComputedStatus => {
  if (a.status === 'draft') return 'draft'
  if (a.expires_at && new Date(a.expires_at).getTime() <= Date.now()) return 'expired'
  if (a.publish_at && new Date(a.publish_at).getTime() > Date.now()) return 'scheduled'
  return 'published'
}

const STATUS_META: Record<ComputedStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-200 text-gray-600' },
  expired: { label: 'Expired', className: 'bg-rose-100 text-rose-700' },
  scheduled: { label: 'Scheduled', className: 'bg-amber-100 text-amber-700' },
  published: { label: 'Published', className: 'bg-green-100 text-green-700' },
}

type StatusFilter = 'all' | ComputedStatus

const FinanceAnnouncementsView: React.FC = () => {
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(emptyForm())
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const listQueryKey = ['finance-announcements', statusFilter] as const
  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      announcementService.getAnnouncements({ category: 'finance', status: statusFilter }),
  })

  // The server filters by category; the client-side filter guards against a
  // backend that doesn't know `category` yet and returns every announcement.
  const announcements = (listQuery.data?.data ?? []).filter((a) => a.category === 'finance')

  const resetForm = () => {
    setEditing(null)
    setForm(emptyForm())
    setPendingFiles([])
    setError(null)
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['finance-announcements'] })
    // Finance posts also surface on the students' board and the admin manage list.
    queryClient.invalidateQueries({ queryKey: ['announcements-manage'] })
    queryClient.invalidateQueries({ queryKey: ['announcement-feed'] })
    queryClient.invalidateQueries({ queryKey: ['announcement-unread-count'] })
  }

  // Every finance announcement goes to all students; the server enforces this too.
  const buildPayload = (): CreateAnnouncementData => ({
    title: form.title.trim(),
    body: form.body || null,
    category: 'finance',
    audience: 'students',
    scope: 'institution',
    is_pinned: form.is_pinned,
    status: form.status,
    publish_at: form.publish_at || null,
    expires_at: form.expires_at || null,
  })

  const createMutation = useMutation({
    mutationFn: async (payload: CreateAnnouncementData) => {
      const res = await announcementService.createAnnouncement(payload)
      const id = res.data?.id
      if (id) {
        for (const file of pendingFiles) {
          await announcementService.uploadAttachment(id, file)
        }
      }
      return res
    },
    onSuccess: () => {
      invalidate()
      resetForm()
      toast.success('Announcement posted to all students.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to post announcement.')
      setError(message)
      toast.error(message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: CreateAnnouncementData }) =>
      announcementService.updateAnnouncement(payload.id, payload.data),
    onSuccess: () => {
      invalidate()
      resetForm()
      toast.success('Announcement updated.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to update announcement.')
      setError(message)
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementService.deleteAnnouncement(id),
    onSuccess: () => {
      invalidate()
      toast.success('Announcement deleted.')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to delete announcement.')),
  })

  // Live attachment ops while editing an existing announcement.
  const uploadMutation = useMutation({
    mutationFn: (payload: { id: string; file: File }) =>
      announcementService.uploadAttachment(payload.id, payload.file),
    onSuccess: (_data, payload) => {
      invalidate()
      // Refresh the editing snapshot so the new attachment shows immediately.
      const fresh = queryClient
        .getQueryData<{ data: Announcement[] }>(listQueryKey)
        ?.data?.find((a) => a.id === payload.id)
      if (fresh) setEditing(fresh)
      toast.success('Attachment uploaded.')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to upload attachment.')),
  })

  const deleteAttachmentMutation = useMutation({
    mutationFn: (payload: { id: string; attachmentId: string }) =>
      announcementService.deleteAttachment(payload.id, payload.attachmentId),
    onSuccess: (_data, payload) => {
      invalidate()
      setEditing((prev) =>
        prev ? { ...prev, attachments: prev.attachments.filter((att) => att.id !== payload.attachmentId) } : prev,
      )
      toast.success('Attachment removed.')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to remove attachment.')),
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleEdit = (a: Announcement) => {
    setEditing(a)
    setError(null)
    setPendingFiles([])
    setForm({
      title: a.title,
      body: a.body ?? '',
      is_pinned: a.is_pinned,
      status: a.status,
      publish_at: toLocalInput(a.publish_at),
      expires_at: toLocalInput(a.expires_at),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (a: Announcement) => {
    if (window.confirm(`Delete "${a.title}"? This cannot be undone.`)) {
      deleteMutation.mutate(a.id)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: buildPayload() })
    } else {
      createMutation.mutate(buildPayload())
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Finance Announcements</h1>
        <p className="text-gray-600 mt-1">
          Post finance notices — payment reminders, due dates, cashier hours. Every announcement
          here is automatically visible to all students.
        </p>
      </div>

      {/* Create / edit form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          {editing ? `Edit "${editing.title}"` : 'Create announcement'}
        </h3>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="e.g. Second quarter tuition due March 15"
            disabled={isSaving}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
            <RichTextEditor
              value={form.body}
              onChange={(html) => setForm((prev) => ({ ...prev, body: html }))}
              placeholder="Write your announcement…"
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 w-fit">
            <Megaphone className="w-4 h-4 shrink-0" />
            Sent to all students in your institution.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <Select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as AnnouncementStatus }))}
                options={[
                  { value: 'published', label: 'Published' },
                  { value: 'draft', label: 'Draft (hidden)' },
                ]}
                className="w-full"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Publish at <span className="text-xs font-normal text-gray-500">(optional)</span>
              </label>
              <Input
                type="datetime-local"
                value={form.publish_at}
                onChange={(e) => setForm((prev) => ({ ...prev, publish_at: e.target.value }))}
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expires at <span className="text-xs font-normal text-gray-500">(optional)</span>
              </label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm((prev) => ({ ...prev, expires_at: e.target.value }))}
                disabled={isSaving}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              checked={form.is_pinned}
              onChange={(e) => setForm((prev) => ({ ...prev, is_pinned: e.target.checked }))}
              disabled={isSaving}
            />
            <span className="text-sm text-gray-700 inline-flex items-center gap-1">
              <Pin className="w-3.5 h-3.5 text-amber-500" /> Pin to top
            </span>
          </label>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Attachments</label>
            {editing ? (
              <div className="space-y-2">
                {editing.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <span className="inline-flex items-center gap-2 text-sm text-gray-700 min-w-0">
                      <Paperclip className="w-4 h-4 shrink-0" />
                      <span className="truncate">{att.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteAttachmentMutation.mutate({ id: editing.id, attachmentId: att.id })}
                      className="text-gray-400 hover:text-red-600"
                      title="Remove attachment"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 cursor-pointer hover:bg-gray-50 w-fit">
                  <PlusIcon className="w-4 h-4" /> Add file
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadMutation.mutate({ id: editing.id, file })
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <span className="inline-flex items-center gap-2 text-sm text-gray-700 min-w-0">
                      <Paperclip className="w-4 h-4 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                      className="text-gray-400 hover:text-red-600"
                      title="Remove file"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 cursor-pointer hover:bg-gray-50 w-fit">
                  <PlusIcon className="w-4 h-4" /> Add file
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setPendingFiles((prev) => [...prev, file])
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {editing ? (isSaving ? 'Updating…' : 'Update announcement') : isSaving ? 'Posting…' : 'Post announcement'}
            </Button>
            {editing && (
              <Button type="button" variant="outline" disabled={isSaving} onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-gray-900">Finance announcements</h3>
          <div className="w-full sm:w-44">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'published', label: 'Published' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'draft', label: 'Draft' },
                { value: 'expired', label: 'Expired' },
              ]}
              className="w-full"
            />
          </div>
        </div>
        {listQuery.isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : announcements.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500">
              {statusFilter === 'all' ? 'No finance announcements yet.' : 'No announcements match this status.'}
            </p>
            {statusFilter === 'all' ? (
              <p className="text-sm text-gray-400 mt-1">Use the form above to post your first one.</p>
            ) : (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="text-sm text-indigo-600 hover:text-indigo-700 mt-1"
              >
                Show all
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {announcements.map((a) => {
              const badge = STATUS_META[computedStatus(a)]
              return (
                <div key={a.id} className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.is_pinned && <Pin className="w-4 h-4 text-amber-500 fill-amber-500" />}
                        <h4 className="text-base font-semibold text-gray-900">{a.title}</h4>
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        All students · by {a.author_name} · {a.read_count} read{a.read_count === 1 ? '' : 's'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Publish: {a.publish_at ? formatDate(a.publish_at) : 'Immediately'}
                        {' · '}
                        Expires: {a.expires_at ? formatDate(a.expires_at) : 'Never'}
                      </p>
                      {a.attachments.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1 inline-flex items-center gap-1">
                          <Paperclip className="w-3 h-3" /> {a.attachments.length} attachment
                          {a.attachments.length === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(a)} title="Edit">
                        <PencilSquareIcon className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(a)}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default FinanceAnnouncementsView
