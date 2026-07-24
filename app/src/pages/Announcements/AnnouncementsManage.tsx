import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSquareIcon, TrashIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import { Pin, Paperclip } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { useAuth } from '../../hooks/useAuth'
import { announcementService } from '../../services/announcementService'
import { classSectionService } from '../../services/classSectionService'
import { gradeLevelService } from '../../services/gradeLevelService'
import { userService } from '../../services/userService'
import RichTextEditor from '../AssignedSubjects/components/RichTextEditor'
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementScope,
  AnnouncementStatus,
  CreateAnnouncementData,
} from '../../types'

const ADMIN_ROLES = ['super-administrator', 'principal', 'institution-administrator']

interface SectionOption {
  id: string
  title: string
  grade_level: string
}

interface FormState {
  title: string
  body: string
  audience: AnnouncementAudience
  scope: AnnouncementScope
  is_pinned: boolean
  status: AnnouncementStatus
  publish_at: string
  expires_at: string
  section_ids: string[]
  grade_levels: string[]
}

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

// <input type="datetime-local"> value (local wall-clock) -> UTC ISO string for the API
const fromLocalInput = (value: string | null): string | null => {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

const formatDate = (value: string | null): string => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const audienceLabel = (audience: AnnouncementAudience): string =>
  audience === 'both' ? 'Students & Teachers' : audience === 'teachers' ? 'Teachers' : 'Students'

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

const statusBadge = (a: Announcement): { label: string; className: string } => STATUS_META[computedStatus(a)]

type StatusFilter = 'all' | ComputedStatus

interface FilterState {
  status: StatusFilter
  publishFrom: string
  publishTo: string
  expiresFrom: string
  expiresTo: string
}

const EMPTY_FILTERS: FilterState = {
  status: 'all',
  publishFrom: '',
  publishTo: '',
  expiresFrom: '',
  expiresTo: '',
}

const AnnouncementsManage: React.FC = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = ADMIN_ROLES.includes(user?.role?.slug ?? '')

  const emptyForm = (): FormState => ({
    title: '',
    body: '',
    audience: isAdmin ? 'both' : 'students',
    scope: isAdmin ? 'institution' : 'sections',
    is_pinned: false,
    status: 'published',
    publish_at: '',
    expires_at: '',
    section_ids: [],
    grade_levels: [],
  })

  const [form, setForm] = useState<FormState>(emptyForm())
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)

  // Include the filters in the key so the server re-queries when they change.
  // invalidate() still matches via the ['announcements-manage'] prefix.
  const listQueryKey = ['announcements-manage', filters] as const
  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      announcementService.getAnnouncements({
        status: filters.status,
        publish_from: filters.publishFrom,
        publish_to: filters.publishTo,
        expires_from: filters.expiresFrom,
        expires_to: filters.expiresTo,
      }),
  })

  // Section picker source: teachers see sections they advise or teach a subject in; admins see all.
  const sectionsQuery = useQuery({
    queryKey: ['announcement-sections', isAdmin],
    queryFn: async (): Promise<SectionOption[]> => {
      const res = isAdmin
        ? await classSectionService.getClassSectionsByInstitution(undefined, { per_page: 200 })
        : await userService.getMyClassSections({ per_page: 200, include_taught: true })
      const rows = (res.data ?? []) as Array<{ id: string; title: string; grade_level?: string }>
      return rows.map((r) => ({ id: r.id, title: r.title, grade_level: r.grade_level ?? '' }))
    },
  })

  const gradeLevelsQuery = useQuery({
    queryKey: ['announcement-grade-levels'],
    queryFn: () => gradeLevelService.getGradeLevels(),
    enabled: isAdmin,
  })

  const announcements = listQuery.data?.data ?? []
  const sectionOptions = sectionsQuery.data ?? []
  const gradeLevelOptions = gradeLevelsQuery.data ?? []

  const filtersActive =
    filters.status !== 'all' ||
    !!filters.publishFrom ||
    !!filters.publishTo ||
    !!filters.expiresFrom ||
    !!filters.expiresTo

  const resetForm = () => {
    setEditing(null)
    setForm(emptyForm())
    setPendingFiles([])
    setError(null)
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['announcements-manage'] })
    queryClient.invalidateQueries({ queryKey: ['announcement-feed'] })
    queryClient.invalidateQueries({ queryKey: ['announcement-unread-count'] })
  }

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
      toast.success('Announcement posted.')
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
      audience: a.audience,
      scope: a.scope,
      is_pinned: a.is_pinned,
      status: a.status,
      publish_at: toLocalInput(a.publish_at),
      expires_at: toLocalInput(a.expires_at),
      section_ids: a.section_ids,
      grade_levels: a.grade_levels,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (a: Announcement) => {
    if (window.confirm(`Delete "${a.title}"? This cannot be undone.`)) {
      deleteMutation.mutate(a.id)
    }
  }

  const toggleSection = (id: string) => {
    setForm((prev) => ({
      ...prev,
      section_ids: prev.section_ids.includes(id)
        ? prev.section_ids.filter((s) => s !== id)
        : [...prev.section_ids, id],
    }))
  }

  const toggleGradeLevel = (title: string) => {
    setForm((prev) => ({
      ...prev,
      grade_levels: prev.grade_levels.includes(title)
        ? prev.grade_levels.filter((g) => g !== title)
        : [...prev.grade_levels, title],
    }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }
    if (form.scope === 'sections' && form.section_ids.length === 0) {
      setError('Select at least one section.')
      return
    }
    if (form.scope === 'grade_levels' && form.grade_levels.length === 0) {
      setError('Select at least one grade level.')
      return
    }

    const payload: CreateAnnouncementData = {
      title: form.title.trim(),
      body: form.body || null,
      audience: isAdmin ? form.audience : 'students',
      scope: isAdmin ? form.scope : 'sections',
      is_pinned: form.is_pinned,
      status: form.status,
      publish_at: fromLocalInput(form.publish_at),
      expires_at: fromLocalInput(form.expires_at),
      section_ids: form.section_ids,
      grade_levels: form.grade_levels,
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const scopeSummary = (a: Announcement): string => {
    if (a.scope === 'institution') return 'Institution-wide'
    if (a.scope === 'sections')
      return `Sections: ${a.sections.map((s) => s.title).join(', ') || '—'}`
    return `Grade levels: ${a.grade_levels.join(', ') || '—'}`
  }

  const showSectionPicker = (isAdmin ? form.scope : 'sections') === 'sections'
  const showGradePicker = isAdmin && form.scope === 'grade_levels'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Manage Announcements</h1>
        <p className="text-gray-600 mt-1">
          {isAdmin
            ? 'Post announcements to students, teachers, or both — institution-wide or targeted to specific grade levels or sections.'
            : 'Post announcements to the students of the class sections you teach.'}
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
            placeholder="e.g. Midterm exam schedule"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Audience</label>
                <Select
                  value={form.audience}
                  onChange={(e) => setForm((prev) => ({ ...prev, audience: e.target.value as AnnouncementAudience }))}
                  options={[
                    { value: 'students', label: 'Students only' },
                    { value: 'teachers', label: 'Teachers only' },
                    { value: 'both', label: 'Students & Teachers' },
                  ]}
                  className="w-full"
                  disabled={isSaving}
                />
              </div>
            )}

            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target</label>
                <Select
                  value={form.scope}
                  onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value as AnnouncementScope }))}
                  options={[
                    { value: 'institution', label: 'Everyone (institution-wide)' },
                    { value: 'grade_levels', label: 'Specific grade levels' },
                    { value: 'sections', label: 'Specific sections' },
                  ]}
                  className="w-full"
                  disabled={isSaving}
                />
              </div>
            )}
          </div>

          {showSectionPicker && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sections {!isAdmin && <span className="text-xs font-normal text-gray-500">(only sections you teach or advise)</span>}
              </label>
              {sectionsQuery.isLoading ? (
                <p className="text-sm text-gray-500">Loading sections…</p>
              ) : sectionOptions.length === 0 ? (
                <p className="text-sm text-gray-500">No sections available.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {sectionOptions.map((section) => (
                    <label
                      key={section.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={form.section_ids.includes(section.id)}
                        onChange={() => toggleSection(section.id)}
                        disabled={isSaving}
                      />
                      <span className="text-sm text-gray-800">{section.title}</span>
                      {section.grade_level && (
                        <span className="text-xs text-gray-400">· {section.grade_level}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {showGradePicker && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Grade levels</label>
              {gradeLevelsQuery.isLoading ? (
                <p className="text-sm text-gray-500">Loading grade levels…</p>
              ) : gradeLevelOptions.length === 0 ? (
                <p className="text-sm text-gray-500">No grade levels available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {gradeLevelOptions.map((gl) => {
                    const active = form.grade_levels.includes(gl.title)
                    return (
                      <button
                        key={gl.id}
                        type="button"
                        onClick={() => toggleGradeLevel(gl.title)}
                        disabled={isSaving}
                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                          active
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {gl.title}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

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
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-gray-900">
              {isAdmin ? 'All announcements' : 'Your announcements'}
            </h3>
            {filtersActive && !listQuery.isLoading && (
              <span className="text-xs text-gray-500">
                {announcements.length} result{announcements.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {/* Filters: status + publish/expiry date ranges (applied server-side via query params).
              Flex-wrap so the date-range groups keep their width and wrap to a new line on
              narrower viewports instead of squeezing the other controls; stacks on mobile. */}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full sm:w-44">
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <Select
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as StatusFilter }))}
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
            <div className="w-full sm:flex-1 sm:min-w-[15rem]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Publish from / to</label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    type="date"
                    aria-label="Published on or after"
                    value={filters.publishFrom}
                    onChange={(e) => setFilters((prev) => ({ ...prev, publishFrom: e.target.value }))}
                    className="w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    type="date"
                    aria-label="Published on or before"
                    value={filters.publishTo}
                    onChange={(e) => setFilters((prev) => ({ ...prev, publishTo: e.target.value }))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
            <div className="w-full sm:flex-1 sm:min-w-[15rem]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Expires from / to</label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    type="date"
                    aria-label="Expires on or after"
                    value={filters.expiresFrom}
                    onChange={(e) => setFilters((prev) => ({ ...prev, expiresFrom: e.target.value }))}
                    className="w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    type="date"
                    aria-label="Expires on or before"
                    value={filters.expiresTo}
                    onChange={(e) => setFilters((prev) => ({ ...prev, expiresTo: e.target.value }))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!filtersActive}
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="w-full sm:w-auto shrink-0"
            >
              Clear filters
            </Button>
          </div>
        </div>
        {listQuery.isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : announcements.length === 0 ? (
          filtersActive ? (
            <div className="py-12 text-center">
              <p className="text-gray-500">No announcements match your filters.</p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-sm text-indigo-600 hover:text-indigo-700 mt-1"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-gray-500">No announcements yet.</p>
              <p className="text-sm text-gray-400 mt-1">Use the form above to post your first one.</p>
            </div>
          )
        ) : (
          <div className="divide-y divide-gray-200">
            {announcements.map((a) => {
              const badge = statusBadge(a)
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
                        <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                          {audienceLabel(a.audience)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {scopeSummary(a)} · {a.read_count} read{a.read_count === 1 ? '' : 's'}
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

export default AnnouncementsManage
