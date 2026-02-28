import React, { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  Bars3Icon,
  DocumentTextIcon,
  CalendarDaysIcon,
  ClockIcon,
  AcademicCapIcon,
  PencilSquareIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nanoid } from 'nanoid'
import { subjectEcrService } from '@/services/subjectEcrService'
import {
  DEFAULT_RULES_BY_TYPE,
  assessmentMethodService,
  type AssessmentMethod,
  type AssessmentMethodInput,
  type AssessmentMethodQuestion,
  type AssessmentMethodRules,
  type AssessmentMethodType,
  type AssessmentPublishStatus,
  type AssessmentQuestionType,
} from '@/services/assessmentMethodService'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Badge } from '@/components/badge'
import { Switch } from '@/components/switch'

interface AssessmentBuilderTabProps {
  subjectId: string
}

interface BuilderDraft {
  id?: string
  subjectEcrId: string
  type: AssessmentMethodType
  status: AssessmentPublishStatus
  title: string
  description: string
  quarter: string
  scheduledDate: string
  openAt: string
  closeAt: string
  dueAt: string
  allowLateSubmission: boolean
  rules: AssessmentMethodRules
  questions: AssessmentMethodQuestion[]
}

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>

const CANVAS_DROP_ID = 'assessment-method-question-canvas'
const PALETTE_PREFIX = 'assessment-palette::'

const TYPE_OPTIONS: Array<{
  id: AssessmentMethodType
  label: string
  icon: IconType
  accentClass: string
}> = [
  {
    id: 'quiz',
    label: 'Quiz',
    icon: AcademicCapIcon,
    accentClass: 'text-indigo-700 bg-indigo-100 border-indigo-200',
  },
  {
    id: 'assignment',
    label: 'Assignment',
    icon: PencilSquareIcon,
    accentClass: 'text-emerald-700 bg-emerald-100 border-emerald-200',
  },
  {
    id: 'exam',
    label: 'Exam',
    icon: BookOpenIcon,
    accentClass: 'text-violet-700 bg-violet-100 border-violet-200',
  },
]

const QUESTION_TYPE_OPTIONS: Array<{
  type: AssessmentQuestionType
  label: string
  hint: string
  icon: IconType
  accentClass: string
}> = [
  {
    type: 'single_choice',
    label: 'Multiple Choice',
    hint: 'One correct option',
    icon: ListBulletIcon,
    accentClass: 'text-indigo-700 bg-indigo-100 border-indigo-200',
  },
  {
    type: 'multiple_choice',
    label: 'Multiple Response',
    hint: 'Many correct options',
    icon: CheckCircleIcon,
    accentClass: 'text-sky-700 bg-sky-100 border-sky-200',
  },
  {
    type: 'true_false',
    label: 'True / False',
    hint: 'Binary answer',
    icon: ExclamationTriangleIcon,
    accentClass: 'text-amber-700 bg-amber-100 border-amber-200',
  },
  {
    type: 'fill_in_the_blanks',
    label: 'Fill in the Blanks',
    hint: 'Ordered blank answers',
    icon: DocumentTextIcon,
    accentClass: 'text-violet-700 bg-violet-100 border-violet-200',
  },
  {
    type: 'short_answer',
    label: 'Short Answer',
    hint: 'Short text response',
    icon: PencilSquareIcon,
    accentClass: 'text-emerald-700 bg-emerald-100 border-emerald-200',
  },
  {
    type: 'essay',
    label: 'Essay',
    hint: 'Long-form response',
    icon: BookOpenIcon,
    accentClass: 'text-rose-700 bg-rose-100 border-rose-200',
  },
]

const QUESTION_TYPE_LABELS: Record<AssessmentQuestionType, string> = {
  single_choice: 'Multiple Choice',
  multiple_choice: 'Multiple Response',
  true_false: 'True / False',
  fill_in_the_blanks: 'Fill in the Blanks',
  short_answer: 'Short Answer',
  essay: 'Essay',
}

const getTypeOption = (type: AssessmentMethodType) =>
  TYPE_OPTIONS.find((option) => option.id === type) ?? TYPE_OPTIONS[0]

const getQuestionTypeOption = (type: AssessmentQuestionType) =>
  QUESTION_TYPE_OPTIONS.find((option) => option.type === type) ?? QUESTION_TYPE_OPTIONS[0]

const toDateTimeLocal = (value: string | null | undefined): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num: number) => `${num}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const choiceLetter = (index: number) => String.fromCharCode(65 + index)

const makeQuestion = (type: AssessmentQuestionType): AssessmentMethodQuestion => {
  if (type === 'true_false') {
    return {
      id: nanoid(),
      type,
      prompt: '',
      points: 1,
      choices: ['True', 'False'],
      correctAnswers: ['True'],
      blanks: [],
      sampleAnswer: '',
    }
  }
  if (type === 'fill_in_the_blanks') {
    return {
      id: nanoid(),
      type,
      prompt: '',
      points: 1,
      choices: [],
      correctAnswers: [],
      blanks: [''],
      sampleAnswer: '',
    }
  }
  if (type === 'short_answer' || type === 'essay') {
    return {
      id: nanoid(),
      type,
      prompt: '',
      points: 1,
      choices: [],
      correctAnswers: [],
      blanks: [],
      sampleAnswer: '',
    }
  }
  return {
    id: nanoid(),
    type,
    prompt: '',
    points: 1,
    choices: ['', ''],
    correctAnswers: ['A'],
    blanks: [],
    sampleAnswer: '',
  }
}

const draftFromAssessment = (assessment: AssessmentMethod): BuilderDraft => ({
  id: assessment.id,
  subjectEcrId: assessment.subjectEcrId,
  type: assessment.type,
  status: assessment.status,
  title: assessment.title,
  description: assessment.description,
  quarter: assessment.quarter,
  scheduledDate: assessment.scheduledDate ?? '',
  openAt: toDateTimeLocal(assessment.openAt),
  closeAt: toDateTimeLocal(assessment.closeAt),
  dueAt: toDateTimeLocal(assessment.dueAt),
  allowLateSubmission: assessment.allowLateSubmission,
  rules: assessment.rules,
  questions: assessment.questions.map((question) => ({
    ...question,
    id: question.id || nanoid(),
    choices:
      question.type === 'single_choice' || question.type === 'multiple_choice'
        ? question.choices.length > 0
          ? question.choices
          : ['', '']
        : question.choices,
    blanks: question.type === 'fill_in_the_blanks' && question.blanks.length === 0 ? [''] : question.blanks,
  })),
})

const newDraft = (type: AssessmentMethodType, subjectEcrId: string): BuilderDraft => ({
  subjectEcrId,
  type,
  status: 'draft',
  title: '',
  description: '',
  quarter: '1',
  scheduledDate: '',
  openAt: '',
  closeAt: '',
  dueAt: '',
  allowLateSubmission: false,
  rules: { ...DEFAULT_RULES_BY_TYPE[type] },
  questions: [],
})

const paletteCardId = (type: AssessmentQuestionType) => `${PALETTE_PREFIX}${type}`

const PaletteCard: React.FC<{
  type: AssessmentQuestionType
  label: string
  hint: string
  icon: IconType
  accentClass: string
}> = ({ type, label, hint, icon: Icon, accentClass }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: paletteCardId(type),
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={clsx(
        'w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50',
        isDragging && 'opacity-50'
      )}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5 rounded-lg border p-1.5', accentClass)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            <p className="mt-1 text-xs text-gray-500">{hint}</p>
          </div>
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-1 text-gray-400">
          <Bars3Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  )
}

interface SortableQuestionCardProps {
  question: AssessmentMethodQuestion
  index: number
  onTypeChange: (id: string, type: AssessmentQuestionType) => void
  onPromptChange: (id: string, prompt: string) => void
  onPointsChange: (id: string, points: number) => void
  onRemove: (id: string) => void
  onChoiceChange: (id: string, index: number, value: string) => void
  onAddChoice: (id: string) => void
  onRemoveChoice: (id: string, index: number) => void
  onToggleCorrectChoice: (id: string, letter: string, allowMultiple: boolean) => void
  onTrueFalseChange: (id: string, value: 'True' | 'False') => void
  onBlankChange: (id: string, index: number, value: string) => void
  onAddBlank: (id: string) => void
  onRemoveBlank: (id: string, index: number) => void
  onSampleAnswerChange: (id: string, value: string) => void
}

const SortableQuestionCard: React.FC<SortableQuestionCardProps> = ({
  question,
  index,
  onTypeChange,
  onPromptChange,
  onPointsChange,
  onRemove,
  onChoiceChange,
  onAddChoice,
  onRemoveChoice,
  onToggleCorrectChoice,
  onTrueFalseChange,
  onBlankChange,
  onAddBlank,
  onRemoveBlank,
  onSampleAnswerChange,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  })
  const questionMeta = getQuestionTypeOption(question.type)
  const QuestionIcon = questionMeta.icon

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={clsx(
        'rounded-xl border border-gray-200 bg-white p-4 shadow-sm',
        isDragging && 'opacity-60'
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
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
          <span className="text-sm font-semibold text-gray-900">Question {index + 1}</span>
          <Badge color="indigo">
            <QuestionIcon className="h-3.5 w-3.5" />
            {QUESTION_TYPE_LABELS[question.type]}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={question.type}
              onChange={(event) => onTypeChange(question.id, event.target.value as AssessmentQuestionType)}
            >
              {QUESTION_TYPE_OPTIONS.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs font-medium text-gray-600">Points</label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={question.points}
              onChange={(event) => onPointsChange(question.id, Number(event.target.value) || 0)}
            />
          </div>
          <Button type="button" variant="ghost" color="danger" onClick={() => onRemove(question.id)}>
            Remove
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">Question prompt</label>
        <textarea
          className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={question.prompt}
          onChange={(event) => onPromptChange(question.id, event.target.value)}
          placeholder="Type your question..."
        />
      </div>

      {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600">Choices</label>
            <Button type="button" variant="outline" size="sm" onClick={() => onAddChoice(question.id)}>
              + Choice
            </Button>
          </div>
          {question.choices.map((choice, choiceIndex) => {
            const letter = choiceLetter(choiceIndex)
            const checked = question.correctAnswers.includes(letter)
            return (
              <div key={choiceIndex} className="flex items-center gap-2">
                <button
                  type="button"
                  className={clsx(
                    'h-6 w-6 rounded-full border text-xs font-semibold',
                    checked
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700'
                  )}
                  onClick={() => onToggleCorrectChoice(question.id, letter, question.type === 'multiple_choice')}
                  title="Mark as correct"
                >
                  {letter}
                </button>
                <Input
                  value={choice}
                  onChange={(event) => onChoiceChange(question.id, choiceIndex, event.target.value)}
                  placeholder={`Option ${letter}`}
                />
                {question.choices.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    color="danger"
                    size="sm"
                    onClick={() => onRemoveChoice(question.id, choiceIndex)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            )
          })}
          <p className="text-xs text-gray-500">
            {question.type === 'multiple_choice'
              ? 'Select all correct options.'
              : 'Select the single correct option.'}
          </p>
        </div>
      )}

      {question.type === 'true_false' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Correct answer</label>
          <div className="flex gap-2">
            {(['True', 'False'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onTrueFalseChange(question.id, value)}
                className={clsx(
                  'rounded-lg border px-3 py-2 text-sm font-medium',
                  question.correctAnswers[0] === value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 bg-white text-gray-700'
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}

      {question.type === 'fill_in_the_blanks' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600">Correct blank answers (in order)</label>
            <Button type="button" variant="outline" size="sm" onClick={() => onAddBlank(question.id)}>
              + Blank
            </Button>
          </div>
          {question.blanks.map((blank, blankIndex) => (
            <div key={blankIndex} className="flex items-center gap-2">
              <Input
                value={blank}
                onChange={(event) => onBlankChange(question.id, blankIndex, event.target.value)}
                placeholder={`Blank ${blankIndex + 1}`}
              />
              {question.blanks.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  color="danger"
                  size="sm"
                  onClick={() => onRemoveBlank(question.id, blankIndex)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-500">
            Use a pipe to allow alternatives (example: Manila | Manila City).
          </p>
        </div>
      )}

      {(question.type === 'short_answer' || question.type === 'essay') && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {question.type === 'essay' ? 'Suggested rubric answer (optional)' : 'Expected answer (optional)'}
          </label>
          <textarea
            className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={question.sampleAnswer}
            onChange={(event) => onSampleAnswerChange(question.id, event.target.value)}
            placeholder="Optional answer key for auto-checking"
          />
        </div>
      )}
    </div>
  )
}

export const AssessmentBuilderTab: React.FC<AssessmentBuilderTabProps> = ({ subjectId }) => {
  const queryClient = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const [activeType, setActiveType] = useState<AssessmentMethodType>('quiz')
  const [builderOpen, setBuilderOpen] = useState(false)
  const [draft, setDraft] = useState<BuilderDraft | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const { data: ecrRes } = useQuery({
    queryKey: ['subjectEcrs', subjectId],
    queryFn: () => subjectEcrService.getBySubject(subjectId),
    enabled: !!subjectId,
  })

  const ecrs = (ecrRes?.data ?? []) as { id: string; title: string }[]
  const firstEcrId = ecrs[0]?.id

  const { data: methods = [], isLoading } = useQuery({
    queryKey: ['assessment-methods', subjectId, activeType],
    queryFn: () => assessmentMethodService.listBySubject(subjectId, activeType),
    enabled: !!subjectId,
  })

  const saveCreateMutation = useMutation({
    mutationFn: (payload: AssessmentMethodInput) => assessmentMethodService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-methods', subjectId] })
      setBuilderOpen(false)
      setDraft(null)
    },
  })

  const saveUpdateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AssessmentMethodInput }) =>
      assessmentMethodService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-methods', subjectId] })
      setBuilderOpen(false)
      setDraft(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assessmentMethodService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-methods', subjectId] })
    },
  })

  const totalPoints = useMemo(
    () => draft?.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0) ?? 0,
    [draft]
  )

  const validationErrors = useMemo(() => {
    if (!draft) return []
    const errors: string[] = []

    if (!draft.title.trim()) {
      errors.push('Assessment title is required.')
    }
    if (draft.questions.length === 0) {
      errors.push('Add at least one question to the canvas.')
    }

    draft.questions.forEach((question, index) => {
      const label = `Question ${index + 1}`
      if (!question.prompt.trim()) {
        errors.push(`${label} needs a prompt.`)
      }
      if (question.points <= 0) {
        errors.push(`${label} points must be greater than 0.`)
      }

      if (question.type === 'single_choice' || question.type === 'multiple_choice') {
        const normalizedChoices = question.choices.map((choice) => choice.trim()).filter(Boolean)
        if (normalizedChoices.length < 2) {
          errors.push(`${label} needs at least two choices.`)
        }
        if (question.correctAnswers.length === 0) {
          errors.push(`${label} needs at least one correct choice.`)
        }
      }

      if (question.type === 'fill_in_the_blanks') {
        const blanks = question.blanks.map((blank) => blank.trim()).filter(Boolean)
        if (blanks.length === 0) {
          errors.push(`${label} needs at least one blank answer.`)
        }
      }
    })

    return errors
  }, [draft])

  const canSave =
    !!draft &&
    validationErrors.length === 0 &&
    !saveCreateMutation.isPending &&
    !saveUpdateMutation.isPending &&
    !!firstEcrId

  const updateDraft = (updater: (current: BuilderDraft) => BuilderDraft) => {
    setDraft((current) => (current ? updater(current) : current))
  }

  const updateQuestion = (questionId: string, updater: (question: AssessmentMethodQuestion) => AssessmentMethodQuestion) => {
    updateDraft((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId ? updater(question) : question
      ),
    }))
  }

  const addQuestion = (type: AssessmentQuestionType, insertAt?: number) => {
    updateDraft((current) => {
      const nextQuestions = [...current.questions]
      const question = makeQuestion(type)
      if (insertAt == null || insertAt < 0 || insertAt >= nextQuestions.length) {
        nextQuestions.push(question)
      } else {
        nextQuestions.splice(insertAt, 0, question)
      }
      return { ...current, questions: nextQuestions }
    })
  }

  const removeQuestion = (questionId: string) => {
    updateDraft((current) => ({
      ...current,
      questions: current.questions.filter((question) => question.id !== questionId),
    }))
  }

  const openCreateBuilder = () => {
    if (!firstEcrId) return
    setDraft(newDraft(activeType, firstEcrId))
    setBuilderOpen(true)
  }

  const openEditBuilder = (assessment: AssessmentMethod) => {
    setActiveType(assessment.type)
    setDraft(draftFromAssessment(assessment))
    setBuilderOpen(true)
  }

  const closeBuilder = () => {
    setBuilderOpen(false)
    setDraft(null)
    setActiveDragId(null)
  }

  const handleSave = () => {
    if (!draft) return
    const payload: AssessmentMethodInput = {
      subjectEcrId: draft.subjectEcrId || firstEcrId || '',
      type: draft.type,
      status: draft.status,
      title: draft.title,
      description: draft.description,
      quarter: draft.quarter,
      scheduledDate: draft.scheduledDate || null,
      openAt: draft.openAt || null,
      closeAt: draft.closeAt || null,
      dueAt: draft.dueAt || null,
      allowLateSubmission: draft.allowLateSubmission,
      rules: draft.rules,
      questions: draft.questions,
    }

    if (draft.id) {
      saveUpdateMutation.mutate({ id: draft.id, payload })
    } else {
      saveCreateMutation.mutate(payload)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    if (!draft || !event.over) return

    const activeId = String(event.active.id)
    const overId = String(event.over.id)

    if (activeId.startsWith(PALETTE_PREFIX)) {
      const type = activeId.replace(PALETTE_PREFIX, '') as AssessmentQuestionType
      const insertIndex = draft.questions.findIndex((question) => question.id === overId)
      addQuestion(type, overId === CANVAS_DROP_ID ? undefined : insertIndex)
      return
    }

    const oldIndex = draft.questions.findIndex((question) => question.id === activeId)
    const newIndex = draft.questions.findIndex((question) => question.id === overId)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    updateDraft((current) => ({
      ...current,
      questions: arrayMove(current.questions, oldIndex, newIndex),
    }))
  }

  const currentDragType = useMemo(() => {
    if (!activeDragId || !activeDragId.startsWith(PALETTE_PREFIX)) return null
    return activeDragId.replace(PALETTE_PREFIX, '') as AssessmentQuestionType
  }, [activeDragId])

  return (
    <div className="space-y-4">
      {!firstEcrId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <div className="mb-1 inline-flex items-center gap-1 font-semibold">
            <ExclamationTriangleIcon className="h-4 w-4" />
            Setup required
          </div>
          <div>
          Create your <strong>Components of Summative Assessment</strong> first so assessment methods can be attached to an ECR component.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setActiveType(option.id)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition',
                activeType === option.id
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              <option.icon className="h-4 w-4" />
              {option.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          onClick={openCreateBuilder}
          disabled={!firstEcrId}
          className="inline-flex items-center gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          Add {TYPE_OPTIONS.find((option) => option.id === activeType)?.label}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-gray-500">
          <ClockIcon className="mx-auto mb-2 h-5 w-5 animate-pulse text-gray-400" />
          Loading assessment methods...
        </div>
      ) : methods.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
          {React.createElement(getTypeOption(activeType).icon, { className: 'mx-auto mb-2 h-6 w-6 text-gray-400' })}
          No {activeType}s yet. Create one and build questions with drag and drop.
        </div>
      ) : (
        <ul className="space-y-3">
          {methods.map((method) => {
            const points = method.questions.reduce((sum, question) => sum + question.points, 0)
            const typeMeta = getTypeOption(method.type)
            const TypeIcon = typeMeta.icon
            return (
              <li
                key={method.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={clsx('rounded-lg border p-1.5', typeMeta.accentClass)}>
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <h4 className="truncate font-semibold text-gray-900">{method.title}</h4>
                      <Badge color={method.status === 'published' ? 'green' : 'amber'}>
                        {method.status === 'published' ? (
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                        ) : (
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                        )}
                        {method.status === 'published' ? 'Published' : 'Draft'}
                      </Badge>
                      <Badge color="blue">
                        <TypeIcon className="h-3.5 w-3.5" />
                        {typeMeta.label}
                      </Badge>
                      <Badge color="zinc">Q{method.quarter}</Badge>
                    </div>
                    {method.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{method.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <DocumentTextIcon className="h-4 w-4" />
                        {method.questions.length} question(s)
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" />
                        {points} point(s)
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDaysIcon className="h-4 w-4" />
                        Due: {formatDateTime(method.dueAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditBuilder(method)}
                      className="rounded-md p-2 text-gray-500 transition hover:bg-indigo-50 hover:text-indigo-600"
                      title="Edit"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!method.id) return
                        if (window.confirm('Delete this assessment method?')) {
                          deleteMutation.mutate(method.id)
                        }
                      }}
                      className="rounded-md p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {builderOpen && draft && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="absolute inset-0 flex flex-col bg-white">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-indigo-50 via-white to-white px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className={clsx('rounded-lg border p-1.5', getTypeOption(draft.type).accentClass)}>
                    {React.createElement(getTypeOption(draft.type).icon, { className: 'h-4 w-4' })}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {draft.id ? 'Edit' : 'Create'} {draft.type.charAt(0).toUpperCase() + draft.type.slice(1)}
                  </h3>
                  <Badge color={draft.status === 'published' ? 'green' : 'amber'}>
                    {draft.status === 'published' ? (
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                    ) : (
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                    )}
                    {draft.status === 'published' ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Drag question types into the canvas, then configure scoring and assessment rules.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    <DocumentTextIcon className="h-3.5 w-3.5" />
                    {draft.questions.length} question(s)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                    <ClockIcon className="h-3.5 w-3.5" />
                    {totalPoints} point(s)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircleIcon className="h-3.5 w-3.5" />
                    {validationErrors.length === 0 ? 'Ready to save' : `${validationErrors.length} issue(s)`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={closeBuilder}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSave} disabled={!canSave}>
                  {draft.id ? 'Save Changes' : 'Create Assessment'}
                </Button>
                <button
                  type="button"
                  onClick={closeBuilder}
                  className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </header>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 bg-gray-50 p-4 lg:grid-cols-[18rem_minmax(0,1fr)_22rem]">
                <aside className="min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-1.5 text-indigo-700">
                      <LightBulbIcon className="h-4 w-4" />
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900">Question Types</h4>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Drag any block into the canvas.
                  </p>
                  <div className="mt-4 space-y-2">
                    {QUESTION_TYPE_OPTIONS.map((option) => (
                      <PaletteCard
                        key={option.type}
                        type={option.type}
                        label={option.label}
                        hint={option.hint}
                        icon={option.icon}
                        accentClass={option.accentClass}
                      />
                    ))}
                  </div>
                </aside>

                <CanvasPanel
                  draft={draft}
                  onTypeChange={(questionId, type) =>
                    updateQuestion(questionId, (question) => {
                      const base = makeQuestion(type)
                      return {
                        ...base,
                        id: question.id,
                        prompt: question.prompt,
                        points: question.points,
                      }
                    })
                  }
                  onPromptChange={(questionId, prompt) =>
                    updateQuestion(questionId, (question) => ({ ...question, prompt }))
                  }
                  onPointsChange={(questionId, points) =>
                    updateQuestion(questionId, (question) => ({ ...question, points }))
                  }
                  onRemove={removeQuestion}
                  onChoiceChange={(questionId, index, value) =>
                    updateQuestion(questionId, (question) => {
                      const nextChoices = [...question.choices]
                      nextChoices[index] = value
                      return { ...question, choices: nextChoices }
                    })
                  }
                  onAddChoice={(questionId) =>
                    updateQuestion(questionId, (question) => ({
                      ...question,
                      choices: [...question.choices, ''],
                    }))
                  }
                  onRemoveChoice={(questionId, index) =>
                    updateQuestion(questionId, (question) => {
                      const nextChoices = question.choices.filter((_, choiceIndex) => choiceIndex !== index)
                      const validLetters = new Set(nextChoices.map((_, choiceIndex) => choiceLetter(choiceIndex)))
                      const nextCorrect = question.correctAnswers.filter((answer) => validLetters.has(answer))
                      return {
                        ...question,
                        choices: nextChoices,
                        correctAnswers: nextCorrect.length ? nextCorrect : [choiceLetter(0)],
                      }
                    })
                  }
                  onToggleCorrectChoice={(questionId, letter, allowMultiple) =>
                    updateQuestion(questionId, (question) => {
                      if (!allowMultiple) {
                        return { ...question, correctAnswers: [letter] }
                      }
                      const set = new Set(question.correctAnswers)
                      if (set.has(letter)) set.delete(letter)
                      else set.add(letter)
                      return {
                        ...question,
                        correctAnswers: Array.from(set).sort(),
                      }
                    })
                  }
                  onTrueFalseChange={(questionId, value) =>
                    updateQuestion(questionId, (question) => ({ ...question, correctAnswers: [value] }))
                  }
                  onBlankChange={(questionId, index, value) =>
                    updateQuestion(questionId, (question) => {
                      const nextBlanks = [...question.blanks]
                      nextBlanks[index] = value
                      return { ...question, blanks: nextBlanks }
                    })
                  }
                  onAddBlank={(questionId) =>
                    updateQuestion(questionId, (question) => ({
                      ...question,
                      blanks: [...question.blanks, ''],
                    }))
                  }
                  onRemoveBlank={(questionId, index) =>
                    updateQuestion(questionId, (question) => ({
                      ...question,
                      blanks: question.blanks.filter((_, blankIndex) => blankIndex !== index),
                    }))
                  }
                  onSampleAnswerChange={(questionId, value) =>
                    updateQuestion(questionId, (question) => ({ ...question, sampleAnswer: value }))
                  }
                />

                <aside className="min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700">
                      <PencilSquareIcon className="h-4 w-4" />
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900">Assessment Settings</h4>
                  </div>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Assessment Type</label>
                      <select
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={draft.type}
                        onChange={(event) => {
                          const nextType = event.target.value as AssessmentMethodType
                          updateDraft((current) => ({
                            ...current,
                            type: nextType,
                            rules: { ...DEFAULT_RULES_BY_TYPE[nextType] },
                          }))
                        }}
                      >
                        {TYPE_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Input
                      label="Title"
                      placeholder="e.g. Quiz 1 - Fractions"
                      value={draft.title}
                      onChange={(event) =>
                        updateDraft((current) => ({ ...current, title: event.target.value }))
                      }
                    />

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
                      <textarea
                        className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={draft.description}
                        onChange={(event) =>
                          updateDraft((current) => ({ ...current, description: event.target.value }))
                        }
                        placeholder="Optional instructions for students"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Quarter</label>
                        <select
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={draft.quarter}
                          onChange={(event) =>
                            updateDraft((current) => ({ ...current, quarter: event.target.value }))
                          }
                        >
                          {['1', '2', '3', '4'].map((quarter) => (
                            <option key={quarter} value={quarter}>
                              Q{quarter}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
                        <select
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={draft.status}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              status: event.target.value as AssessmentPublishStatus,
                            }))
                          }
                        >
                          <option value="draft">Draft</option>
                          <option value="published">Published</option>
                        </select>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <CalendarDaysIcon className="h-3.5 w-3.5" />
                        Schedule
                      </p>
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Scheduled Date</label>
                          <Input
                            type="date"
                            value={draft.scheduledDate}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                scheduledDate: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Open At</label>
                          <Input
                            type="datetime-local"
                            value={draft.openAt}
                            onChange={(event) =>
                              updateDraft((current) => ({ ...current, openAt: event.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Close At</label>
                          <Input
                            type="datetime-local"
                            value={draft.closeAt}
                            onChange={(event) =>
                              updateDraft((current) => ({ ...current, closeAt: event.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Due At</label>
                          <Input
                            type="datetime-local"
                            value={draft.dueAt}
                            onChange={(event) =>
                              updateDraft((current) => ({ ...current, dueAt: event.target.value }))
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                          <span className="text-xs font-medium text-gray-700">Allow late submission</span>
                          <Switch
                            checked={draft.allowLateSubmission}
                            onChange={(value) =>
                              updateDraft((current) => ({ ...current, allowLateSubmission: Boolean(value) }))
                            }
                            color="indigo"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <ClockIcon className="h-3.5 w-3.5" />
                        Rules
                      </p>
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Max Attempts</label>
                          <Input
                            type="number"
                            min={1}
                            value={draft.rules.maxAttempts}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                rules: {
                                  ...current.rules,
                                  maxAttempts: Math.max(1, Number(event.target.value) || 1),
                                },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Time Limit (minutes)</label>
                          <Input
                            type="number"
                            min={1}
                            value={draft.rules.timeLimitMinutes ?? ''}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                rules: {
                                  ...current.rules,
                                  timeLimitMinutes:
                                    event.target.value === '' ? null : Math.max(1, Number(event.target.value) || 1),
                                },
                              }))
                            }
                            placeholder="No limit"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Pass Mark (%)</label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={draft.rules.passMark ?? ''}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                rules: {
                                  ...current.rules,
                                  passMark:
                                    event.target.value === ''
                                      ? null
                                      : Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                                },
                              }))
                            }
                            placeholder="Optional"
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                          <span className="text-xs font-medium text-gray-700">Randomize questions</span>
                          <Switch
                            checked={draft.rules.randomizeQuestions}
                            onChange={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                rules: { ...current.rules, randomizeQuestions: Boolean(value) },
                              }))
                            }
                            color="indigo"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                      <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        <DocumentTextIcon className="h-3.5 w-3.5" />
                        Summary
                      </p>
                      <p className="mt-1 text-sm text-indigo-800">{draft.questions.length} question(s)</p>
                      <p className="text-sm text-indigo-800">{totalPoints} total point(s)</p>
                    </div>
                  </div>
                </aside>
              </div>

              <DragOverlay>
                {currentDragType ? (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow">
                    {React.createElement(getQuestionTypeOption(currentDragType).icon, { className: 'h-4 w-4' })}
                    {QUESTION_TYPE_LABELS[currentDragType]}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {validationErrors.length > 0 && (
              <div className="border-t border-red-100 bg-red-50 px-6 py-3">
                <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                  <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                  Validation Issues
                </div>
                <ul className="list-disc space-y-1 pl-5 text-xs text-red-700">
                  {validationErrors.slice(0, 4).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                  {validationErrors.length > 4 && <li>+ {validationErrors.length - 4} more issue(s)</li>}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const CanvasPanel: React.FC<{
  draft: BuilderDraft
  onTypeChange: (id: string, type: AssessmentQuestionType) => void
  onPromptChange: (id: string, prompt: string) => void
  onPointsChange: (id: string, points: number) => void
  onRemove: (id: string) => void
  onChoiceChange: (id: string, index: number, value: string) => void
  onAddChoice: (id: string) => void
  onRemoveChoice: (id: string, index: number) => void
  onToggleCorrectChoice: (id: string, letter: string, allowMultiple: boolean) => void
  onTrueFalseChange: (id: string, value: 'True' | 'False') => void
  onBlankChange: (id: string, index: number, value: string) => void
  onAddBlank: (id: string) => void
  onRemoveBlank: (id: string, index: number) => void
  onSampleAnswerChange: (id: string, value: string) => void
}> = ({
  draft,
  onTypeChange,
  onPromptChange,
  onPointsChange,
  onRemove,
  onChoiceChange,
  onAddChoice,
  onRemoveChoice,
  onToggleCorrectChoice,
  onTrueFalseChange,
  onBlankChange,
  onAddBlank,
  onRemoveBlank,
  onSampleAnswerChange,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID })

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        'min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4',
        isOver && 'border-indigo-400 ring-2 ring-indigo-100'
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-1 text-sky-700">
              <DocumentTextIcon className="h-3.5 w-3.5" />
            </div>
            Question Canvas
          </h4>
          <p className="text-xs text-gray-500">Drop blocks here, then reorder and configure.</p>
        </div>
      </div>

      {draft.questions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
          <DocumentTextIcon className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          Drag question types from the left panel into this canvas.
        </div>
      ) : (
        <SortableContext items={draft.questions.map((question) => question.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {draft.questions.map((question, index) => (
              <SortableQuestionCard
                key={question.id}
                question={question}
                index={index}
                onTypeChange={onTypeChange}
                onPromptChange={onPromptChange}
                onPointsChange={onPointsChange}
                onRemove={onRemove}
                onChoiceChange={onChoiceChange}
                onAddChoice={onAddChoice}
                onRemoveChoice={onRemoveChoice}
                onToggleCorrectChoice={onToggleCorrectChoice}
                onTrueFalseChange={onTrueFalseChange}
                onBlankChange={onBlankChange}
                onAddBlank={onAddBlank}
                onRemoveBlank={onRemoveBlank}
                onSampleAnswerChange={onSampleAnswerChange}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </section>
  )
}

export default AssessmentBuilderTab
