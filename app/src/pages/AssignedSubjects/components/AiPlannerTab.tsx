import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Alert } from '@/components/alert'
import { Fieldset, Field, Label } from '@/components/fieldset'
import { Divider } from '@/components/divider'
import type { SubjectQuarterPlan } from '@/types'
import { aiPlannerService } from '@/services/aiPlannerService'
import { subjectQuarterPlanService } from '@/services/subjectQuarterPlanService'
import { topicService } from '@/services/topicService'
import { subjectEcrService } from '@/services/subjectEcrService'

interface AiPlannerTabProps {
  subjectId: string
}

const WEEKDAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
] as const

export const AiPlannerTab: React.FC<AiPlannerTabProps> = ({ subjectId }) => {
  const [quarter, setQuarter] = useState<'1' | '2' | '3' | '4'>('1')

  const [topicCount, setTopicCount] = useState(10)
  const [topicSuggestions, setTopicSuggestions] = useState<Array<{ title: string; description?: string }>>([])

  const [startDate, setStartDate] = useState('')
  const [examDate, setExamDate] = useState('')
  const [meetingDays, setMeetingDays] = useState<string[]>(['monday', 'wednesday', 'friday'])
  const [excludedDates, setExcludedDates] = useState('') // comma-separated YYYY-MM-DD

  const [quizzesCount, setQuizzesCount] = useState(0)
  const [assignmentsCount, setAssignmentsCount] = useState(0)
  const [activitiesCount, setActivitiesCount] = useState(0)
  const [projectsCount, setProjectsCount] = useState(0)

  const [selectedSubjectEcrId, setSelectedSubjectEcrId] = useState<string>('')

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const getApiErrorMessage = (e: unknown): string | null => {
    if (!e || typeof e !== 'object') return null
    if (!('response' in e)) return null
    const response = (e as Record<string, unknown>).response
    if (!response || typeof response !== 'object') return null
    if (!('data' in response)) return null
    const data = (response as Record<string, unknown>).data
    if (!data || typeof data !== 'object') return null
    if (!('message' in data)) return null
    const message = (data as Record<string, unknown>).message
    return typeof message === 'string' ? message : null
  }

  const quarterPlanQuery = useQuery({
    queryKey: ['subject-quarter-plan', subjectId, quarter],
    queryFn: () => subjectQuarterPlanService.getBySubjectAndQuarter(subjectId, quarter),
    enabled: !!subjectId && !!quarter,
    staleTime: 30_000,
  })

  const subjectEcrQuery = useQuery({
    queryKey: ['subject-ecr', subjectId],
    queryFn: () => subjectEcrService.getBySubject(subjectId),
    enabled: !!subjectId,
    staleTime: 30_000,
  })

  const subjectEcrComponents = (subjectEcrQuery.data?.data ?? []) as Array<{ id: string; title: string }>
  const defaultSubjectEcrId = useMemo(() => subjectEcrComponents[0]?.id ?? '', [subjectEcrComponents])

  // Hydrate form from saved plan (when available)
  React.useEffect(() => {
    const plan = quarterPlanQuery.data as SubjectQuarterPlan | null | undefined
    if (!plan) return
    setStartDate(plan.start_date)
    setExamDate(plan.exam_date)
    setMeetingDays((plan.meeting_days ?? []).filter(Boolean) as string[])
    setExcludedDates((plan.excluded_dates ?? []).join(', '))
    setQuizzesCount(plan.quizzes_count ?? 0)
    setAssignmentsCount(plan.assignments_count ?? 0)
    setActivitiesCount(plan.activities_count ?? 0)
    setProjectsCount(plan.projects_count ?? 0)
  }, [quarterPlanQuery.data])

  React.useEffect(() => {
    if (!selectedSubjectEcrId && defaultSubjectEcrId) setSelectedSubjectEcrId(defaultSubjectEcrId)
  }, [defaultSubjectEcrId, selectedSubjectEcrId])

  const excludedDatesArray = useMemo(() => {
    return excludedDates
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
  }, [excludedDates])

  const toggleMeetingDay = (day: string) => {
    setMeetingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  const handleGenerateTopics = async () => {
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const topics = await aiPlannerService.generateTopics(subjectId, quarter, topicCount)
      setTopicSuggestions(topics.map((t) => ({ title: t.title, description: t.description })))
      setSuccess(`Generated ${topics.length} topic suggestions.`)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) ?? 'Failed to generate topics.')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveTopics = async () => {
    setError(null)
    setSuccess(null)
    if (topicSuggestions.length === 0) return
    setBusy(true)
    try {
      await topicService.bulkCreateTopics({
        subject_id: subjectId,
        quarter,
        topics: topicSuggestions.map((t) => ({ title: t.title, description: t.description })),
      })
      setSuccess('Topics saved successfully.')
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) ?? 'Failed to save topics.')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveQuarterPlan = async () => {
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      await subjectQuarterPlanService.upsert({
        subject_id: subjectId,
        quarter,
        start_date: startDate,
        exam_date: examDate,
        meeting_days: meetingDays,
        excluded_dates: excludedDatesArray,
        quizzes_count: quizzesCount,
        assignments_count: assignmentsCount,
        activities_count: activitiesCount,
        projects_count: projectsCount,
      })
      setSuccess('Quarter plan saved.')
      await quarterPlanQuery.refetch()
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) ?? 'Failed to save quarter plan.')
    } finally {
      setBusy(false)
    }
  }

  const handleGenerateLessonPlans = async (overwrite: boolean) => {
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const plans = await aiPlannerService.generateLessonPlans(subjectId, quarter, overwrite)
      setSuccess(`Generated ${plans.length} lesson plan entries.`)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) ?? 'Failed to generate lesson plans.')
    } finally {
      setBusy(false)
    }
  }

  const handleGenerateAssessments = async (overwrite: boolean) => {
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const created = await aiPlannerService.generateAssessments(subjectId, quarter, {
        subject_ecr_id: selectedSubjectEcrId || undefined,
        overwrite,
      })
      setSuccess(`Generated ${created.length} assessment items.`)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) ?? 'Failed to generate assessment items.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-xl font-semibold">AI Planner</h2>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} show />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} show />}

      <Fieldset className="bg-white rounded-lg shadow p-6 space-y-4 border border-zinc-100">
        <Field>
          <Label>Quarter</Label>
          <div className="flex gap-2">
            {(['1', '2', '3', '4'] as const).map((q) => (
              <Button
                key={q}
                type="button"
                variant={quarter === q ? 'solid' : 'outline'}
                color="primary"
                size="sm"
                onClick={() => setQuarter(q)}
                disabled={busy}
              >
                {q === '1' ? '1st' : q === '2' ? '2nd' : q === '3' ? '3rd' : '4th'} Quarter
              </Button>
            ))}
          </div>
        </Field>
      </Fieldset>

      <Fieldset className="bg-white rounded-lg shadow p-6 space-y-4 border border-zinc-100">
        <h3 className="text-lg font-medium">A) Topics</h3>

        <Field>
          <Label htmlFor="topicCount">How many topics?</Label>
          <Input
            id="topicCount"
            type="number"
            min={1}
            max={50}
            value={topicCount}
            onChange={(e) => setTopicCount(Number(e.target.value))}
            disabled={busy}
          />
        </Field>

        <div className="flex gap-2">
          <Button type="button" onClick={handleGenerateTopics} loading={busy}>
            Generate topic suggestions
          </Button>
          <Button
            type="button"
            variant="outline"
            color="primary"
            onClick={handleSaveTopics}
            disabled={busy || topicSuggestions.length === 0}
          >
            Save topics
          </Button>
        </div>

        {topicSuggestions.length > 0 && (
          <div className="mt-2 space-y-2">
            {topicSuggestions.map((t, idx) => (
              <div key={idx} className="rounded border border-gray-200 p-3">
                <div className="font-medium text-gray-900">{t.title}</div>
                {t.description && <div className="text-sm text-gray-600">{t.description}</div>}
              </div>
            ))}
          </div>
        )}
      </Fieldset>

      <Fieldset className="bg-white rounded-lg shadow p-6 space-y-4 border border-zinc-100">
        <h3 className="text-lg font-medium">B) Quarter schedule + workload</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="startDate">Quarter start date</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
          </Field>
          <Field>
            <Label htmlFor="examDate">Exam date</Label>
            <Input id="examDate" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} disabled={busy} />
          </Field>
        </div>

        <Field>
          <Label>Meeting days</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <Button
                key={d.key}
                type="button"
                size="sm"
                variant={meetingDays.includes(d.key) ? 'solid' : 'outline'}
                color="primary"
                onClick={() => toggleMeetingDay(d.key)}
                disabled={busy}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </Field>

        <Field>
          <Label htmlFor="excludedDates">Excluded dates (comma-separated YYYY-MM-DD)</Label>
          <Input
            id="excludedDates"
            type="text"
            placeholder="e.g. 2026-02-10, 2026-02-17"
            value={excludedDates}
            onChange={(e) => setExcludedDates(e.target.value)}
            disabled={busy}
          />
        </Field>

        <Divider soft />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="quizzesCount">Quizzes</Label>
            <Input id="quizzesCount" type="number" min={0} value={quizzesCount} onChange={(e) => setQuizzesCount(Number(e.target.value))} disabled={busy} />
          </Field>
          <Field>
            <Label htmlFor="assignmentsCount">Assignments</Label>
            <Input id="assignmentsCount" type="number" min={0} value={assignmentsCount} onChange={(e) => setAssignmentsCount(Number(e.target.value))} disabled={busy} />
          </Field>
          <Field>
            <Label htmlFor="activitiesCount">Activities</Label>
            <Input id="activitiesCount" type="number" min={0} value={activitiesCount} onChange={(e) => setActivitiesCount(Number(e.target.value))} disabled={busy} />
          </Field>
          <Field>
            <Label htmlFor="projectsCount">Projects</Label>
            <Input id="projectsCount" type="number" min={0} value={projectsCount} onChange={(e) => setProjectsCount(Number(e.target.value))} disabled={busy} />
          </Field>
        </div>

        <Button type="button" onClick={handleSaveQuarterPlan} loading={busy}>
          Save quarter plan
        </Button>
      </Fieldset>

      <Fieldset className="bg-white rounded-lg shadow p-6 space-y-4 border border-zinc-100">
        <h3 className="text-lg font-medium">C) Generate daily lesson plans</h3>
        <div className="flex gap-2">
          <Button type="button" onClick={() => handleGenerateLessonPlans(false)} loading={busy}>
            Generate (upsert)
          </Button>
          <Button type="button" variant="outline" color="primary" onClick={() => handleGenerateLessonPlans(true)} disabled={busy}>
            Generate (overwrite)
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          Uses your schedule (start date, exam date, meeting days, excluded dates) + the quarter topics to create one lesson plan per meeting day, plus an exam-day entry.
        </p>
      </Fieldset>

      <Fieldset className="bg-white rounded-lg shadow p-6 space-y-4 border border-zinc-100">
        <h3 className="text-lg font-medium">D) Generate quizzes/assignments/activities/projects</h3>

        {subjectEcrComponents.length === 0 ? (
          <Alert
            type="warning"
            show
            message="No Components of Summative Assessment found. Please set it first in the 'Components of Summative Assessment' tab, then come back here."
          />
        ) : (
          <>
            <Field>
              <Label htmlFor="subjectEcrId">Save generated items under this assessment component</Label>
              <select
                id="subjectEcrId"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                value={selectedSubjectEcrId}
                onChange={(e) => setSelectedSubjectEcrId(e.target.value)}
                disabled={busy}
              >
                {subjectEcrComponents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex gap-2">
              <Button type="button" onClick={() => handleGenerateAssessments(false)} loading={busy}>
                Generate (append)
              </Button>
              <Button type="button" variant="outline" color="primary" onClick={() => handleGenerateAssessments(true)} disabled={busy}>
                Generate (overwrite quarter)
              </Button>
            </div>
          </>
        )}
      </Fieldset>
    </div>
  )
}

