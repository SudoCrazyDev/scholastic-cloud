import { nanoid } from 'nanoid'
import { subjectEcrItemService, type SubjectEcrItem } from './subjectEcrItemService'

export type AssessmentMethodType = 'quiz' | 'assignment' | 'exam'
export type AssessmentPublishStatus = 'draft' | 'published'
export type AssessmentQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'fill_in_the_blanks'
  | 'true_false'
  | 'short_answer'
  | 'essay'

export interface AssessmentMethodRules {
  maxAttempts: number
  timeLimitMinutes: number | null
  passMark: number | null
  randomizeQuestions: boolean
}

export interface AssessmentMethodQuestion {
  id: string
  type: AssessmentQuestionType
  prompt: string
  points: number
  choices: string[]
  correctAnswers: string[]
  blanks: string[]
  sampleAnswer: string
}

export interface AssessmentMethod {
  id?: string
  subjectEcrId: string
  type: AssessmentMethodType
  status: AssessmentPublishStatus
  title: string
  description: string
  quarter: string
  scheduledDate: string | null
  openAt: string | null
  closeAt: string | null
  dueAt: string | null
  allowLateSubmission: boolean
  rules: AssessmentMethodRules
  questions: AssessmentMethodQuestion[]
  createdAt?: string
  updatedAt?: string
}

export type AssessmentMethodInput = Omit<AssessmentMethod, 'id' | 'createdAt' | 'updatedAt'>

const QUESTION_TYPE_SET = new Set<AssessmentQuestionType>([
  'single_choice',
  'multiple_choice',
  'fill_in_the_blanks',
  'true_false',
  'short_answer',
  'essay',
])

const DEFAULT_RULES_BY_TYPE: Record<AssessmentMethodType, AssessmentMethodRules> = {
  quiz: {
    maxAttempts: 3,
    timeLimitMinutes: 30,
    passMark: 60,
    randomizeQuestions: false,
  },
  assignment: {
    maxAttempts: 1,
    timeLimitMinutes: null,
    passMark: null,
    randomizeQuestions: false,
  },
  exam: {
    maxAttempts: 1,
    timeLimitMinutes: 90,
    passMark: 70,
    randomizeQuestions: false,
  },
}

const defaultChoiceList = () => ['', '', '', '']

const normalizeChoiceAnswer = (value: unknown): string => {
  const raw = String(value ?? '').trim()
  if (!raw) return 'A'
  if (/^[A-Za-z]$/.test(raw)) return raw.toUpperCase()
  const maybePrefix = raw.match(/^([A-Za-z])[.)\s]/)
  if (maybePrefix?.[1]) return maybePrefix[1].toUpperCase()
  return raw.charAt(0).toUpperCase()
}

const normalizeChoiceAnswers = (value: unknown): string[] => {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  return Array.from(new Set(values.map(normalizeChoiceAnswer).filter(Boolean))).sort()
}

interface RawAssessmentQuestion {
  type?: string
  question?: string
  choices?: string[]
  answer?: string | string[]
  blanks?: string[]
  points?: number
}

const mapQuestionFromItem = (question: RawAssessmentQuestion): AssessmentMethodQuestion => {
  const type = QUESTION_TYPE_SET.has(question.type as AssessmentQuestionType)
    ? (question.type as AssessmentQuestionType)
    : 'single_choice'

  const baseQuestion: AssessmentMethodQuestion = {
    id: nanoid(),
    type,
    prompt: question.question ?? '',
    points: typeof question.points === 'number' ? question.points : 1,
    choices: type === 'true_false' ? ['True', 'False'] : (question.choices ?? defaultChoiceList()),
    correctAnswers: [],
    blanks: [],
    sampleAnswer: '',
  }

  if (type === 'single_choice') {
    baseQuestion.correctAnswers = [normalizeChoiceAnswer(question.answer)]
  } else if (type === 'multiple_choice') {
    baseQuestion.correctAnswers = normalizeChoiceAnswers(question.answer)
  } else if (type === 'true_false') {
    const trueFalseAnswer = String(question.answer ?? 'True').toLowerCase() === 'false' ? 'False' : 'True'
    baseQuestion.correctAnswers = [trueFalseAnswer]
  } else if (type === 'fill_in_the_blanks') {
    baseQuestion.blanks = Array.isArray(question.blanks) && question.blanks.length > 0 ? question.blanks : ['']
  } else {
    baseQuestion.sampleAnswer = Array.isArray(question.answer)
      ? String(question.answer[0] ?? '')
      : String(question.answer ?? '')
  }

  return baseQuestion
}

const mapRulesFromItem = (item: SubjectEcrItem, type: AssessmentMethodType): AssessmentMethodRules => {
  const contentSettings =
    item.content && typeof item.content === 'object' && item.content.settings ? item.content.settings : {}
  const merged = {
    ...DEFAULT_RULES_BY_TYPE[type],
    ...(contentSettings ?? {}),
    ...(item.settings ?? {}),
  }
  return {
    maxAttempts: Math.max(1, Number(merged.max_attempts ?? merged.maxAttempts ?? DEFAULT_RULES_BY_TYPE[type].maxAttempts)),
    timeLimitMinutes:
      merged.time_limit_minutes == null && merged.timeLimitMinutes == null
        ? null
        : Math.max(1, Number(merged.time_limit_minutes ?? merged.timeLimitMinutes)),
    passMark:
      merged.pass_mark == null && merged.passMark == null
        ? null
        : Math.max(0, Math.min(100, Number(merged.pass_mark ?? merged.passMark))),
    randomizeQuestions: Boolean(merged.randomize_questions ?? merged.randomizeQuestions),
  }
}

const fromSubjectEcrItem = (item: SubjectEcrItem): AssessmentMethod => {
  const type = (item.type ?? 'quiz') as AssessmentMethodType
  const questions = (item.content?.questions ?? []).map(mapQuestionFromItem)
  return {
    id: item.id,
    subjectEcrId: item.subject_ecr_id,
    type,
    status: (item.status ?? 'published') as AssessmentPublishStatus,
    title: item.title ?? '',
    description: item.description ?? '',
    quarter: item.quarter ?? '1',
    scheduledDate: item.scheduled_date ?? null,
    openAt: item.open_at ?? null,
    closeAt: item.close_at ?? null,
    dueAt: item.due_at ?? null,
    allowLateSubmission: Boolean(item.allow_late_submission),
    rules: mapRulesFromItem(item, type),
    questions,
    createdAt: (item as any).created_at,
    updatedAt: (item as any).updated_at,
  }
}

const normalizeQuestionForPayload = (question: AssessmentMethodQuestion) => {
  const base = {
    type: question.type,
    question: question.prompt.trim(),
    points: Number.isFinite(question.points) ? question.points : 1,
  }

  if (question.type === 'single_choice') {
    return {
      ...base,
      choices: question.choices.map((choice) => choice.trim()).filter(Boolean),
      answer: question.correctAnswers[0] ?? 'A',
    }
  }

  if (question.type === 'multiple_choice') {
    return {
      ...base,
      choices: question.choices.map((choice) => choice.trim()).filter(Boolean),
      answer: question.correctAnswers.length > 0 ? question.correctAnswers : ['A'],
      allow_multiple: true,
    }
  }

  if (question.type === 'true_false') {
    return {
      ...base,
      choices: ['True', 'False'],
      answer: question.correctAnswers[0] === 'False' ? 'False' : 'True',
    }
  }

  if (question.type === 'fill_in_the_blanks') {
    return {
      ...base,
      blanks: question.blanks.map((blank) => blank.trim()).filter(Boolean),
    }
  }

  return {
    ...base,
    answer: question.sampleAnswer.trim(),
  }
}

const toSubjectEcrItemPayload = (input: AssessmentMethodInput): Omit<SubjectEcrItem, 'id'> => {
  const totalPoints = input.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0)
  return {
    subject_ecr_id: input.subjectEcrId,
    type: input.type,
    status: input.status,
    title: input.title.trim(),
    description: input.description.trim() || undefined,
    quarter: input.quarter,
    scheduled_date: input.scheduledDate,
    open_at: input.openAt,
    close_at: input.closeAt,
    due_at: input.dueAt,
    allow_late_submission: input.allowLateSubmission,
    score: totalPoints,
    settings: {
      max_attempts: input.rules.maxAttempts,
      time_limit_minutes: input.rules.timeLimitMinutes,
      pass_mark: input.rules.passMark,
      randomize_questions: input.rules.randomizeQuestions,
    },
    content: {
      settings: {
        max_attempts: input.rules.maxAttempts,
        time_limit_minutes: input.rules.timeLimitMinutes,
        pass_mark: input.rules.passMark,
        randomize_questions: input.rules.randomizeQuestions,
      },
      questions: input.questions.map(normalizeQuestionForPayload),
    },
  }
}

class AssessmentMethodService {
  async listBySubject(subjectId: string, type: AssessmentMethodType): Promise<AssessmentMethod[]> {
    const response = await subjectEcrItemService.listBySubject({ subject_id: subjectId, type })
    const items = (response?.data ?? []) as SubjectEcrItem[]
    return items.map(fromSubjectEcrItem)
  }

  async create(input: AssessmentMethodInput) {
    return subjectEcrItemService.create(toSubjectEcrItemPayload(input))
  }

  async update(id: string, input: AssessmentMethodInput) {
    return subjectEcrItemService.update(id, toSubjectEcrItemPayload(input))
  }

  async remove(id: string) {
    return subjectEcrItemService.delete(id)
  }
}

export const assessmentMethodService = new AssessmentMethodService()
export { DEFAULT_RULES_BY_TYPE }
