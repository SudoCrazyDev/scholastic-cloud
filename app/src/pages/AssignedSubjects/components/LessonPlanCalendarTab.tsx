import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/button'
import { Alert } from '@/components/alert'
import type { LessonPlan } from '@/types'
import { lessonPlanService } from '@/services/lessonPlanService'
import { subjectEcrItemService, type SubjectEcrItem } from '@/services/subjectEcrItemService'
import { LessonPlanViewer } from './LessonPlanViewer'
import { QuizQuestionsViewer } from './QuizQuestionsViewer'

interface LessonPlanCalendarTabProps {
  subjectId: string
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1)
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function countByType(items: SubjectEcrItem[]) {
  const counts: Record<string, number> = {}
  for (const it of items) {
    const t = it.type || 'other'
    counts[t] = (counts[t] ?? 0) + 1
  }
  return counts
}

// Type badge component
const TypeBadge: React.FC<{ type?: string }> = ({ type }) => {
  if (!type) return null
  
  const getTypeConfig = (type: string) => {
    switch (type.toLowerCase()) {
      case 'quiz':
        return {
          label: 'Quiz',
          className: 'bg-blue-100 text-blue-800 border-blue-300',
          icon: '📝'
        }
      case 'assignment':
        return {
          label: 'Assignment',
          className: 'bg-purple-100 text-purple-800 border-purple-300',
          icon: '📋'
        }
      case 'activity':
        return {
          label: 'Activity',
          className: 'bg-green-100 text-green-800 border-green-300',
          icon: '✏️'
        }
      case 'project':
        return {
          label: 'Project',
          className: 'bg-orange-100 text-orange-800 border-orange-300',
          icon: '🎯'
        }
      default:
        return {
          label: type,
          className: 'bg-gray-100 text-gray-800 border-gray-300',
          icon: '📄'
        }
    }
  }

  const config = getTypeConfig(type)

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  )
}

export const LessonPlanCalendarTab: React.FC<LessonPlanCalendarTabProps> = ({ subjectId }) => {
  const [quarter, setQuarter] = useState<'1' | '2' | '3' | '4'>('1')
  const [cursorMonth, setCursorMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const monthStart = useMemo(() => startOfMonth(cursorMonth), [cursorMonth])
  const monthEnd = useMemo(() => endOfMonth(cursorMonth), [cursorMonth])
  const dateFrom = useMemo(() => toYmd(monthStart), [monthStart])
  const dateTo = useMemo(() => toYmd(monthEnd), [monthEnd])

  const lessonPlansQuery = useQuery({
    queryKey: ['lesson-plans', subjectId, quarter],
    queryFn: () => lessonPlanService.listBySubject(subjectId, quarter),
    enabled: !!subjectId,
    staleTime: 30_000,
  })

  const itemsQuery = useQuery({
    queryKey: ['subject-ecr-items', subjectId, quarter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await subjectEcrItemService.listBySubject({
        subject_id: subjectId,
        quarter,
        date_from: dateFrom,
        date_to: dateTo,
      })
      return (res?.data ?? []) as SubjectEcrItem[]
    },
    enabled: !!subjectId,
    staleTime: 30_000,
  })

  const lessonPlanByDate = useMemo(() => {
    const map = new Map<string, LessonPlan>()
    for (const lp of lessonPlansQuery.data ?? []) {
      map.set(lp.lesson_date, lp)
    }
    return map
  }, [lessonPlansQuery.data])

  const itemsByDate = useMemo(() => {
    const map = new Map<string, SubjectEcrItem[]>()
    for (const it of itemsQuery.data ?? []) {
      const d = it.scheduled_date ?? undefined
      if (!d) continue
      const arr = map.get(d) ?? []
      arr.push(it)
      map.set(d, arr)
    }
    return map
  }, [itemsQuery.data])

  const selectedYmd = selectedDate ? toYmd(selectedDate) : null
  const selectedLessonPlan = selectedYmd ? lessonPlanByDate.get(selectedYmd) : undefined
  const selectedItems = selectedYmd ? itemsByDate.get(selectedYmd) ?? [] : []

  const weeks = useMemo(() => {
    const start = new Date(monthStart)
    const startWeekday = start.getDay() // 0 Sun
    start.setDate(start.getDate() - startWeekday)

    const end = new Date(monthEnd)
    const endWeekday = end.getDay()
    end.setDate(end.getDate() + (6 - endWeekday))

    const days: Date[] = []
    const cur = new Date(start)
    while (cur <= end) {
      days.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }

    const out: Date[][] = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [monthStart, monthEnd])

  const generateLessonPlanHTML = (content: any): string => {
    if (!content) return '<p>No lesson plan content available.</p>'

    const objectives = content.learning_objectives || content.objectives || []
    const materials = content.subject_matter?.materials || content.materials || []
    const references = content.subject_matter?.references || []
    const assignment = content.assignment || content.homework || ''

    let html = ''

    // I. LEARNING OBJECTIVES
    if (objectives.length > 0) {
      html += `
        <div style="margin-bottom: 16px;">
          <h2 style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">I. LEARNING OBJECTIVES</h2>
          <p style="font-size: 14px; margin-bottom: 8px;">At the end of the lesson, learners are expected to:</p>
          <ol style="margin-left: 24px; font-size: 14px;">
            ${objectives.map((obj: string) => `<li style="margin-bottom: 4px;">${obj}</li>`).join('')}
          </ol>
        </div>
      `
    }

    // II. SUBJECT MATTER
    if (content.subject_matter?.topic || materials.length > 0) {
      html += `<div style="margin-bottom: 16px;">
        <h2 style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">II. SUBJECT MATTER</h2>`
      if (content.subject_matter?.topic) {
        html += `<p style="font-size: 14px; margin-left: 16px;"><strong>Topic:</strong> ${content.subject_matter.topic}</p>`
      }
      if (materials.length > 0) {
        html += `<p style="font-size: 14px; margin-left: 16px; margin-top: 8px;"><strong>Materials:</strong></p>
          <ul style="margin-left: 32px; font-size: 14px;">
            ${materials.map((mat: string) => `<li>${mat}</li>`).join('')}
          </ul>`
      }
      if (references.length > 0) {
        html += `<p style="font-size: 14px; margin-left: 16px; margin-top: 8px;"><strong>References:</strong></p>
          <ul style="margin-left: 32px; font-size: 14px;">
            ${references.map((ref: string) => `<li>${ref}</li>`).join('')}
          </ul>`
      }
      html += `</div>`
    }

    // III. PROCEDURE
    if (content.procedure) {
      html += `<div style="margin-bottom: 16px;">
        <h2 style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">III. PROCEDURE</h2>`
      
      // Introduction
      if (content.procedure.introduction) {
        html += `<div style="margin-left: 16px; margin-bottom: 12px;">
          <h3 style="font-size: 14px; font-weight: bold;">A. Introduction (${content.procedure.introduction.time_minutes || 10} minutes)</h3>`
        if (content.procedure.introduction.activity_name) {
          html += `<p style="font-size: 14px; margin-top: 4px;"><strong>Activity:</strong> '${content.procedure.introduction.activity_name}'</p>`
        }
        if (content.procedure.introduction.steps) {
          html += `<ol style="margin-left: 24px; font-size: 14px; margin-top: 4px;">
            ${content.procedure.introduction.steps.map((step: string) => `<li style="margin-bottom: 4px;">${step}</li>`).join('')}
          </ol>`
        }
        html += `</div>`
      }

      // Presentation
      if (content.procedure.presentation?.discussion_points) {
        html += `<div style="margin-left: 16px; margin-bottom: 12px;">
          <h3 style="font-size: 14px; font-weight: bold;">B. Presentation / Discussion (${content.procedure.presentation.time_minutes || 20} minutes)</h3>
          <ol style="margin-left: 24px; font-size: 14px; margin-top: 4px;">
            ${content.procedure.presentation.discussion_points.map((point: string) => `<li style="margin-bottom: 4px;">${point}</li>`).join('')}
          </ol>
        </div>`
      }

      // Guided Practice
      if (content.procedure.guided_practice) {
        html += `<div style="margin-left: 16px; margin-bottom: 12px;">
          <h3 style="font-size: 14px; font-weight: bold;">C. Guided Practice (${content.procedure.guided_practice.time_minutes || 20} minutes)</h3>`
        if (content.procedure.guided_practice.activity_name) {
          html += `<p style="font-size: 14px; margin-top: 4px;"><strong>Activity:</strong> '${content.procedure.guided_practice.activity_name}'</p>`
        }
        if (content.procedure.guided_practice.instructions) {
          html += `<ol style="margin-left: 24px; font-size: 14px; margin-top: 4px;">
            ${content.procedure.guided_practice.instructions.map((inst: string) => `<li style="margin-bottom: 4px;">${inst}</li>`).join('')}
          </ol>`
        }
        html += `</div>`
      }

      // Independent Practice
      if (content.procedure.independent_practice) {
        html += `<div style="margin-left: 16px; margin-bottom: 12px;">
          <h3 style="font-size: 14px; font-weight: bold;">D. Independent Practice (${content.procedure.independent_practice.time_minutes || 15} minutes)</h3>`
        if (content.procedure.independent_practice.activity_name) {
          html += `<p style="font-size: 14px; margin-top: 4px;"><strong>Activity:</strong> '${content.procedure.independent_practice.activity_name}'</p>`
        }
        if (content.procedure.independent_practice.tasks) {
          html += `<ol style="margin-left: 24px; font-size: 14px; margin-top: 4px;">
            ${content.procedure.independent_practice.tasks.map((task: string) => `<li style="margin-bottom: 4px;">${task}</li>`).join('')}
          </ol>`
        }
        html += `</div>`
      }

      // Generalization
      if (content.procedure.generalization?.key_questions) {
        html += `<div style="margin-left: 16px; margin-bottom: 12px;">
          <h3 style="font-size: 14px; font-weight: bold;">E. Generalization (${content.procedure.generalization.time_minutes || 5} minutes)</h3>
          <p style="font-size: 14px; margin-top: 4px; margin-left: 16px;"><strong>Ask:</strong></p>
          <ul style="margin-left: 32px; font-size: 14px; margin-top: 4px;">
            ${content.procedure.generalization.key_questions.map((q: string) => `<li style="margin-bottom: 4px;">${q}</li>`).join('')}
          </ul>
        </div>`
      }
      
      html += `</div>`
    }

    // IV. EVALUATION
    if (content.evaluation?.items?.length > 0) {
      html += `<div style="margin-bottom: 16px;">
        <h2 style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">IV. EVALUATION</h2>
        <p style="font-size: 14px; margin-left: 16px; margin-bottom: 8px;"><strong>${content.evaluation.type || 'Multiple Choice'}</strong>. Choose the correct answer.</p>
        <div style="margin-left: 16px;">`
      content.evaluation.items.forEach((item: any, idx: number) => {
        html += `<div style="margin-bottom: 12px;">
          <p style="font-size: 14px;"><strong>${idx + 1}.</strong> ${item.question}</p>`
        if (item.choices) {
          html += `<div style="margin-left: 24px; font-size: 14px; margin-top: 4px;">
            ${item.choices.map((choice: string) => `<div>${choice}</div>`).join('')}
          </div>`
        }
        if (item.answer) {
          html += `<p style="font-size: 12px; color: green; margin-left: 24px; margin-top: 4px;"><strong>Answer:</strong> ${item.answer}</p>`
        }
        html += `</div>`
      })
      html += `</div></div>`
    }

    // V. ASSIGNMENT
    if (assignment) {
      html += `<div style="margin-bottom: 16px;">
        <h2 style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">V. ASSIGNMENT</h2>
        <p style="font-size: 14px; margin-left: 16px;">${assignment}</p>
      </div>`
    }

    return html
  }

  const handlePrintDay = () => {
    if (!selectedYmd) return
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (!win) return

    const title = selectedLessonPlan?.title ?? `Lesson Plan (${selectedYmd})`
    const lessonPlanHtml = generateLessonPlanHTML(selectedLessonPlan?.content)
    const itemsHtml = selectedItems
      .map((it) => `<li><strong>${(it.type ?? 'item').toUpperCase()}</strong>: ${it.title} ${it.score ? `(${it.score} pts)` : ''}</li>`)
      .join('')

    win.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            @media print {
              @page { margin: 1cm; }
            }
            body { 
              font-family: 'Times New Roman', Times, serif; 
              padding: 24px;
              max-width: 210mm;
              margin: 0 auto;
              line-height: 1.6;
            }
            h1 { 
              font-size: 20px; 
              margin: 0 0 4px; 
              text-align: center;
              text-transform: uppercase;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
            }
            h2 { 
              font-size: 16px; 
              margin: 16px 0 8px;
              font-weight: bold;
            }
            h3 {
              font-size: 14px;
              font-weight: bold;
              margin: 8px 0 4px;
            }
            .meta { 
              text-align: center;
              color: #333; 
              font-size: 14px;
              margin-bottom: 16px;
            }
            .items-section {
              margin-top: 24px;
              padding-top: 16px;
              border-top: 1px solid #ccc;
            }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">Date: ${selectedYmd}</div>
          
          ${lessonPlanHtml}
          
          ${selectedItems.length > 0 ? `
            <div class="items-section">
              <h2>Scheduled Assessment Items</h2>
              <ul>${itemsHtml}</ul>
            </div>
          ` : ''}
          
          <script>
            window.onload = () => {
              setTimeout(() => window.print(), 250);
            };
          </script>
        </body>
      </html>
    `)
    win.document.close()
  }

  const isLoading = lessonPlansQuery.isLoading || itemsQuery.isLoading
  const hasError = !!lessonPlansQuery.error || !!itemsQuery.error

  return (
    <div className="space-y-4">
      {hasError && (
        <Alert
          type="error"
          show
          message="Failed to load lesson plans or scheduled items. Please try again."
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-gray-600" />
          <div className="text-lg font-medium text-gray-900">Lesson Plan Calendar</div>
        </div>

        <div className="flex items-center gap-2">
          {(['1', '2', '3', '4'] as const).map((q) => (
            <Button
              key={q}
              type="button"
              size="sm"
              variant={quarter === q ? 'solid' : 'outline'}
              color="primary"
              onClick={() => setQuarter(q)}
            >
              Q{q}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" color="primary" size="sm" onClick={() => setCursorMonth(addMonths(cursorMonth, -1))}>
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium text-gray-800">{formatMonth(cursorMonth)}</div>
        <Button type="button" variant="outline" color="primary" size="sm" onClick={() => setCursorMonth(addMonths(cursorMonth, 1))}>
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-gray-600">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-1 font-semibold">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weeks.flat().map((d) => {
          const ymd = toYmd(d)
          const inMonth = d.getMonth() === cursorMonth.getMonth()
          const lp = lessonPlanByDate.get(ymd)
          const its = itemsByDate.get(ymd) ?? []
          const counts = countByType(its)
          const hasAnything = !!lp || its.length > 0

          return (
            <button
              key={ymd}
              type="button"
              className={[
                'min-h-[96px] rounded-lg border p-2 text-left transition-colors',
                inMonth ? 'border-gray-200 bg-white hover:border-gray-300' : 'border-gray-100 bg-gray-50 text-gray-400',
                hasAnything ? 'ring-1 ring-indigo-100' : '',
              ].join(' ')}
              onClick={() => setSelectedDate(d)}
              disabled={isLoading}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">{d.getDate()}</div>
                {!!lp && <span className="text-[10px] rounded bg-indigo-100 px-2 py-0.5 text-indigo-700">Plan</span>}
              </div>

              {its.length > 0 && (
                <div className="mt-1 space-y-1">
                  {Object.entries(counts).slice(0, 2).map(([t, n]) => (
                    <div key={t} className="text-[11px] text-gray-700">
                      {t}: {n}
                    </div>
                  ))}
                  {Object.keys(counts).length > 2 && (
                    <div className="text-[11px] text-gray-500">+ more</div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Custom Full-Screen Light Mode Dialog for Lesson Plan Viewing */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 backdrop-blur-sm">
          <div className="min-h-screen px-4 py-8 flex items-start justify-center">
            <div className="relative w-full max-w-6xl bg-white rounded-lg shadow-2xl">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedDate ? dayLabel(selectedDate) : 'Day'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {selectedLessonPlan?.title || 'Lesson Plan & Assessments'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="button" onClick={handlePrintDay} disabled={!selectedYmd}>
                    <PrinterIcon className="h-4 w-4 mr-2" />
                    Print / Export
                  </Button>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(null)}
                    className="rounded-full p-2 hover:bg-gray-100 transition-colors"
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                {/* Lesson Plan */}
                <div>
                  <LessonPlanViewer
                    title={selectedLessonPlan?.title}
                    date={selectedYmd || undefined}
                    content={selectedLessonPlan?.content}
                  />
                </div>

                {/* Scheduled Assessments */}
                {selectedItems.length > 0 && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5 text-indigo-600" />
                      Scheduled Assessments for this Day
                    </h3>
                    <div className="space-y-4">
                      {selectedItems.map((it) => (
                        <div key={it.id ?? it.title} className="rounded-lg border border-gray-200 bg-gray-50 p-5 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 mb-3">
                            <TypeBadge type={it.type} />
                            {typeof it.score === 'number' && (
                              <span className="text-sm font-semibold text-indigo-600">
                                {it.score} points
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-semibold text-gray-900 mb-2">{it.title}</h4>
                          {it.description && (
                            <p className="text-sm text-gray-600 mb-3">{it.description}</p>
                          )}
                          
                          {it.content?.questions && it.content.questions.length > 0 && (
                            <QuizQuestionsViewer
                              questions={it.content.questions}
                              showAnswers={true}
                              title={`${it.type === 'quiz' ? 'Quiz' : 'Activity'} Questions`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 rounded-b-lg flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setSelectedDate(null)}>
                  Close
                </Button>
                <Button type="button" color="primary" onClick={handlePrintDay} disabled={!selectedYmd}>
                  <PrinterIcon className="h-4 w-4 mr-2" />
                  Print Day
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

