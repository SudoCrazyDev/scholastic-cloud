import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/button'
import { Alert } from '@/components/alert'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import type { LessonPlan } from '@/types'
import { lessonPlanService } from '@/services/lessonPlanService'
import { subjectEcrItemService, type SubjectEcrItem } from '@/services/subjectEcrItemService'

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

  const handlePrintDay = () => {
    if (!selectedYmd) return
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (!win) return

    const title = selectedLessonPlan?.title ?? `Lesson Plan (${selectedYmd})`
    const itemsHtml = selectedItems
      .map((it) => `<li><strong>${(it.type ?? 'item').toUpperCase()}</strong>: ${it.title}</li>`)
      .join('')

    win.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            h2 { font-size: 14px; margin: 16px 0 8px; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
            .muted { color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="muted">${selectedYmd}</div>
          <h2>Daily Lesson Plan</h2>
          <pre>${selectedLessonPlan?.content ? JSON.stringify(selectedLessonPlan.content, null, 2) : 'No lesson plan saved for this day.'}</pre>
          <h2>Scheduled items</h2>
          <ul>${itemsHtml || '<li>None</li>'}</ul>
          <script>window.onload = () => window.print();</script>
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

      <Dialog open={!!selectedDate} onClose={() => setSelectedDate(null)} size="2xl">
        <DialogTitle>{selectedDate ? dayLabel(selectedDate) : 'Day'}</DialogTitle>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">Daily Lesson Plan</div>
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 text-xs">
                {selectedLessonPlan?.title ? (
                  <div className="mb-2 text-sm font-medium text-gray-900">{selectedLessonPlan.title}</div>
                ) : null}
                {selectedLessonPlan?.content ? (
                  <pre className="whitespace-pre-wrap">{JSON.stringify(selectedLessonPlan.content, null, 2)}</pre>
                ) : (
                  <div className="text-gray-600">No lesson plan saved for this day.</div>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-900">Scheduled quizzes / assignments / activities / projects</div>
              <div className="mt-2 rounded border border-gray-200 bg-white p-3 text-sm">
                {selectedItems.length === 0 ? (
                  <div className="text-gray-600">None scheduled.</div>
                ) : (
                  <ul className="space-y-2">
                    {selectedItems.map((it) => (
                      <li key={it.id ?? it.title} className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-700">{(it.type ?? 'item').toUpperCase()}</div>
                          <div className="text-sm font-medium text-gray-900">{it.title}</div>
                          {it.description && <div className="text-xs text-gray-600">{it.description}</div>}
                        </div>
                        {typeof it.score === 'number' ? (
                          <div className="text-xs text-gray-500">Score: {it.score}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button type="button" variant="outline" color="primary" onClick={() => setSelectedDate(null)}>
            Close
          </Button>
          <Button type="button" onClick={handlePrintDay} disabled={!selectedYmd}>
            <PrinterIcon className="h-4 w-4 mr-2" />
            Print day
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}

