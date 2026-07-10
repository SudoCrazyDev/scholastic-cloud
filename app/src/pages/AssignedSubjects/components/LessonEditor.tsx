import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { nanoid } from 'nanoid'
import clsx from 'clsx'
import {
  XMarkIcon,
  TrashIcon,
  Bars3Icon,
  DocumentTextIcon,
  PlayCircleIcon,
  PaperClipIcon,
  AcademicCapIcon,
  ArrowUpTrayIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { Switch } from '../../../components/switch'
import { RichTextEditor } from './RichTextEditor'
import { topicService } from '../../../services/topicService'
import { assessmentMethodService, type AssessmentMethodType } from '../../../services/assessmentMethodService'
import type { Topic, LessonBlock } from '../../../types'
import type { CreateTopicData, UpdateTopicData } from '../../../services/topicService'

interface LessonEditorProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Persists the lesson and resolves to the saved Topic.
   * `topicId` is non-null when updating (existing lesson OR one just created in
   * this session), null when creating — so re-saves never duplicate.
   */
  onSubmit: (data: CreateTopicData | UpdateTopicData, topicId: string | null) => Promise<Topic>
  topic?: Topic | null
  subjectId: string
  isLoading?: boolean
}

interface LessonDraft {
  title: string
  description: string
  quarter: string
  estimated_minutes: string
  is_published: boolean
  learning_objectives: string[]
  content: LessonBlock[]
}

const QUARTER_OPTIONS = [
  { value: '1', label: '1st Quarter' },
  { value: '2', label: '2nd Quarter' },
  { value: '3', label: '3rd Quarter' },
  { value: '4', label: '4th Quarter' },
]

const emptyDraft = (): LessonDraft => ({
  title: '',
  description: '',
  quarter: '1',
  estimated_minutes: '',
  is_published: false,
  learning_objectives: [],
  content: [],
})

const draftFromTopic = (topic: Topic): LessonDraft => ({
  title: topic.title,
  description: topic.description || '',
  quarter: topic.quarter || '1',
  estimated_minutes: topic.estimated_minutes != null ? String(topic.estimated_minutes) : '',
  is_published: !!topic.is_published,
  learning_objectives: topic.learning_objectives || [],
  content: (topic.content || []).map((b) => ({ ...b })),
})

const makeBlock = (type: LessonBlock['type']): LessonBlock => {
  switch (type) {
    case 'video':
      return { id: nanoid(), type: 'video', url: '', title: '' }
    case 'file':
      return { id: nanoid(), type: 'file', path: '', url: '', name: '' }
    case 'assessment':
      return { id: nanoid(), type: 'assessment', subject_ecr_item_id: '' }
    default:
      return { id: nanoid(), type: 'rich_text', html: '' }
  }
}

// ── Sortable block wrapper ──────────────────────────────────────────────────
const SortableBlock: React.FC<{ id: string; children: React.ReactNode; onRemove: () => void; label: string; icon: React.ReactNode }> = ({
  id,
  children,
  onRemove,
  label,
  icon,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('rounded-xl border border-gray-200 bg-white p-4 shadow-sm', isDragging && 'opacity-60')}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab rounded-md border border-gray-200 p-1 text-gray-500 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            title="Drag to reorder"
          >
            <Bars3Icon className="h-4 w-4" />
          </button>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            {icon}
            {label}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
          title="Remove block"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  )
}

export const LessonEditor: React.FC<LessonEditorProps> = ({
  isOpen,
  onClose,
  onSubmit,
  topic,
  subjectId,
  isLoading = false,
}) => {
  const isEditing = !!topic
  const [draft, setDraft] = useState<LessonDraft>(emptyDraft())
  const [savedTopicId, setSavedTopicId] = useState<string | null>(topic?.id ?? null)
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    if (isOpen) {
      setDraft(topic ? draftFromTopic(topic) : emptyDraft())
      setSavedTopicId(topic?.id ?? null)
      setError(null)
    }
  }, [isOpen, topic])

  // Assessments available to link (all types merged).
  const { data: linkableAssessments = [] } = useQuery({
    queryKey: ['lesson-linkable-assessments', subjectId],
    queryFn: async () => {
      const types: AssessmentMethodType[] = ['quiz', 'activity', 'assignment', 'exam']
      const results = await Promise.all(types.map((t) => assessmentMethodService.listBySubject(subjectId, t)))
      return results.flat()
    },
    enabled: isOpen && !!subjectId,
  })

  const assessmentOptions = useMemo(
    () => [
      { value: '', label: 'Select an assessment…' },
      ...linkableAssessments
        .filter((a) => !!a.id)
        .map((a) => ({ value: a.id as string, label: `${a.title || 'Untitled'} (${a.type})` })),
    ],
    [linkableAssessments]
  )

  const updateBlock = (id: string, patch: Partial<LessonBlock>) => {
    setDraft((d) => ({
      ...d,
      content: d.content.map((b) => (b.id === id ? ({ ...b, ...patch } as LessonBlock) : b)),
    }))
  }

  const addBlock = (type: LessonBlock['type']) => {
    setDraft((d) => ({ ...d, content: [...d.content, makeBlock(type)] }))
  }

  const removeBlock = (id: string) => {
    setDraft((d) => ({ ...d, content: d.content.filter((b) => b.id !== id) }))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDraft((d) => {
      const oldIndex = d.content.findIndex((b) => b.id === active.id)
      const newIndex = d.content.findIndex((b) => b.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return d
      return { ...d, content: arrayMove(d.content, oldIndex, newIndex) }
    })
  }

  const handleFileUpload = async (blockId: string, file: File) => {
    let topicId = savedTopicId
    // The upload endpoint is keyed by topic id, so an unsaved lesson must be
    // persisted first. Do it transparently — the teacher only needs a title.
    if (!topicId) {
      if (!draft.title.trim()) {
        const msg = 'Add a lesson title before uploading files.'
        setError(msg)
        toast.error(msg)
        return
      }
      try {
        setUploadingBlockId(blockId)
        const saved = await onSubmit(buildPayload(), null)
        topicId = saved.id
        setSavedTopicId(saved.id)
        setDraft((d) => ({ ...d, content: (saved.content || d.content).map((b) => ({ ...b })) }))
        setError(null)
      } catch {
        setError('Failed to save the lesson. Please try again.')
        setUploadingBlockId(null)
        return
      }
    }
    try {
      setUploadingBlockId(blockId)
      const result = await topicService.uploadAttachment(topicId, file)
      const filePatch: Partial<LessonBlock> = {
        path: result.path,
        url: result.url,
        name: result.name,
        mime: result.mime,
        size: result.size,
      }
      // Apply locally, then persist the new content so the upload survives a
      // reopen — otherwise the file reference lives only in component state and
      // is lost unless the teacher remembers to hit Save.
      const nextContent = draft.content.map((b) =>
        b.id === blockId ? ({ ...b, ...filePatch } as LessonBlock) : b
      )
      setDraft((d) => ({ ...d, content: nextContent }))
      const saved = await onSubmit(buildPayload(nextContent), topicId)
      setDraft((d) => ({ ...d, content: (saved.content || nextContent).map((b) => ({ ...b })) }))
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to upload file.')
    } finally {
      setUploadingBlockId(null)
    }
  }

  const validationError = (): string | null => {
    if (!draft.title.trim()) return 'Lesson title is required.'
    for (const block of draft.content) {
      if (block.type === 'video' && !block.url.trim()) return 'A video block is missing its URL.'
      if (block.type === 'file' && !block.path) return 'A file block has no uploaded file.'
      if (block.type === 'assessment' && !block.subject_ecr_item_id) return 'An assessment block has no assessment selected.'
    }
    return null
  }

  const buildPayload = (contentOverride?: LessonBlock[]): CreateTopicData => {
    const objectives = draft.learning_objectives.map((o) => o.trim()).filter(Boolean)
    const minutes = draft.estimated_minutes.trim() === '' ? null : Math.max(0, Number(draft.estimated_minutes) || 0)
    return {
      subject_id: subjectId,
      title: draft.title.trim(),
      description: draft.description.trim(),
      content: contentOverride ?? draft.content,
      learning_objectives: objectives,
      estimated_minutes: minutes,
      is_published: draft.is_published,
      quarter: draft.quarter,
    }
  }

  const handleSave = async () => {
    const err = validationError()
    if (err) {
      setError(err)
      return
    }
    setError(null)
    const wasNew = !savedTopicId
    try {
      const saved = await onSubmit(buildPayload(), savedTopicId)
      setSavedTopicId(saved.id)
      toast.success(wasNew ? 'Lesson saved. You can keep editing or close.' : 'Lesson updated.')
      if (wasNew) {
        // After first create, stay open in edit mode so file uploads work.
        setDraft((d) => ({ ...d, content: (saved.content || d.content).map((b) => ({ ...b })) }))
      }
    } catch {
      setError('Failed to save the lesson. Please try again.')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gray-900/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-gray-50 shadow-xl"
          >
            {/* Header */}
            <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                  <DocumentTextIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{isEditing ? 'Edit Lesson' : 'Create Lesson'}</h3>
                  <p className="text-xs text-gray-500">Build learning content students can read and watch.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="flex flex-col items-end leading-tight">
                    <span className={draft.is_published ? 'font-medium text-indigo-700' : 'font-medium text-amber-700'}>
                      {draft.is_published ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {draft.is_published ? 'Visible to students' : 'Hidden from students'}
                    </span>
                  </span>
                  <Switch
                    checked={draft.is_published}
                    onChange={(v: boolean) => setDraft((d) => ({ ...d, is_published: Boolean(v) }))}
                    color="indigo"
                  />
                </label>
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                  Close
                </Button>
                <Button type="button" onClick={handleSave} disabled={isLoading}>
                  {isLoading ? 'Saving…' : isEditing || savedTopicId ? 'Save Changes' : 'Save Lesson'}
                </Button>
                <button type="button" onClick={onClose} className="rounded-md p-2 text-gray-400 hover:bg-gray-100">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}

              {/* Meta */}
              <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="e.g. Introduction to Fractions"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                  <RichTextEditor
                    value={draft.description}
                    onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
                    placeholder="A short summary of the lesson"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Quarter</label>
                    <Select
                      value={draft.quarter}
                      onChange={(e) => setDraft((d) => ({ ...d, quarter: e.target.value }))}
                      options={QUARTER_OPTIONS}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Estimated minutes</label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.estimated_minutes}
                      onChange={(e) => setDraft((d) => ({ ...d, estimated_minutes: e.target.value }))}
                      placeholder="e.g. 20"
                    />
                  </div>
                </div>

                {/* Learning objectives */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">Learning objectives</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDraft((d) => ({ ...d, learning_objectives: [...d.learning_objectives, ''] }))}
                    >
                      + Objective
                    </Button>
                  </div>
                  {draft.learning_objectives.length === 0 && (
                    <p className="text-xs text-gray-400">Optional — what learners should be able to do after this lesson.</p>
                  )}
                  <div className="space-y-2">
                    {draft.learning_objectives.map((obj, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-400">{idx + 1}.</span>
                        <Input
                          value={obj}
                          onChange={(e) =>
                            setDraft((d) => {
                              const next = [...d.learning_objectives]
                              next[idx] = e.target.value
                              return { ...d, learning_objectives: next }
                            })
                          }
                          placeholder="Objective"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              learning_objectives: d.learning_objectives.filter((_, i) => i !== idx),
                            }))
                          }
                          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Content blocks */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">Lesson content</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => addBlock('rich_text')}>
                      <DocumentTextIcon className="mr-1 h-4 w-4" /> Text
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => addBlock('video')}>
                      <PlayCircleIcon className="mr-1 h-4 w-4" /> Video
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => addBlock('file')}>
                      <PaperClipIcon className="mr-1 h-4 w-4" /> File
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => addBlock('assessment')}>
                      <AcademicCapIcon className="mr-1 h-4 w-4" /> Assessment
                    </Button>
                  </div>
                </div>

                {!savedTopicId && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Add a lesson title, then choose a file — the lesson is saved automatically on your first upload.
                  </p>
                )}

                {draft.content.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
                    Add text, videos, files, or a linked assessment to build the lesson.
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={draft.content.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {draft.content.map((block) => {
                          if (block.type === 'rich_text') {
                            return (
                              <SortableBlock key={block.id} id={block.id} onRemove={() => removeBlock(block.id)} label="Text" icon={<DocumentTextIcon className="h-4 w-4 text-indigo-600" />}>
                                <RichTextEditor value={block.html} onChange={(html) => updateBlock(block.id, { html })} />
                              </SortableBlock>
                            )
                          }
                          if (block.type === 'video') {
                            return (
                              <SortableBlock key={block.id} id={block.id} onRemove={() => removeBlock(block.id)} label="Video" icon={<PlayCircleIcon className="h-4 w-4 text-rose-600" />}>
                                <div className="space-y-2">
                                  <Input
                                    value={block.url}
                                    onChange={(e) => updateBlock(block.id, { url: e.target.value })}
                                    placeholder="YouTube / Vimeo URL"
                                  />
                                  <Input
                                    value={block.title || ''}
                                    onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                                    placeholder="Caption (optional)"
                                  />
                                </div>
                              </SortableBlock>
                            )
                          }
                          if (block.type === 'file') {
                            return (
                              <SortableBlock key={block.id} id={block.id} onRemove={() => removeBlock(block.id)} label="File" icon={<PaperClipIcon className="h-4 w-4 text-emerald-600" />}>
                                {block.path ? (
                                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                    <span className="truncate text-sm text-gray-700">{block.name}</span>
                                    <a href={block.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 underline">
                                      View
                                    </a>
                                  </div>
                                ) : (
                                  <label
                                    className={clsx(
                                      'flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 transition hover:border-indigo-300 hover:bg-indigo-50',
                                      uploadingBlockId === block.id && 'cursor-not-allowed opacity-60'
                                    )}
                                  >
                                    <ArrowUpTrayIcon className="h-4 w-4" />
                                    {uploadingBlockId === block.id ? 'Uploading…' : 'Choose a file (PDF, image, video, audio, slides, doc)'}
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.mp4,.webm,.mov,.m4v,.mp3,.wav,.m4a"
                                      disabled={uploadingBlockId === block.id}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f) handleFileUpload(block.id, f)
                                        e.target.value = ''
                                      }}
                                    />
                                  </label>
                                )}
                              </SortableBlock>
                            )
                          }
                          // assessment
                          return (
                            <SortableBlock key={block.id} id={block.id} onRemove={() => removeBlock(block.id)} label="Assessment" icon={<AcademicCapIcon className="h-4 w-4 text-violet-600" />}>
                              <Select
                                value={block.subject_ecr_item_id}
                                onChange={(e) => {
                                  const picked = linkableAssessments.find((a) => a.id === e.target.value)
                                  updateBlock(block.id, {
                                    subject_ecr_item_id: e.target.value,
                                    title: picked?.title,
                                    assessmentType: picked?.type,
                                  })
                                }}
                                options={assessmentOptions}
                                className="w-full"
                              />
                              <p className="mt-1 text-xs text-gray-400">
                                Links an existing assessment from the Assessment Methods tab.
                              </p>
                            </SortableBlock>
                          )
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </section>

              {draft.estimated_minutes && (
                <p className="flex items-center gap-1 text-xs text-gray-400">
                  <ClockIcon className="h-3.5 w-3.5" /> Estimated {draft.estimated_minutes} min
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default LessonEditor
