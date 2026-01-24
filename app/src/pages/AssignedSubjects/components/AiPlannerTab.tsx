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
import { lessonPlanService } from '@/services/lessonPlanService'
import { 
  LightBulbIcon, 
  CalendarIcon, 
  DocumentTextIcon, 
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline'

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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    topics: true,
    quarterPlan: false,
    lessonPlans: false,
    assessments: false,
  })

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
  const [generatingLessonPlans, setGeneratingLessonPlans] = useState(false)
  const [generationProgress, setGenerationProgress] = useState<number>(0)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)

  // Clear per-quarter suggestions/messages when switching quarters to prevent confusion.
  React.useEffect(() => {
    setTopicSuggestions([])
    setError(null)
    setSuccess(null)
    setExpandedSections({ topics: true, quarterPlan: false, lessonPlans: false, assessments: false })
  }, [quarter])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

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

  const topicsQuery = useQuery({
    queryKey: ['topics', subjectId],
    queryFn: () => topicService.getTopics(subjectId),
    enabled: !!subjectId,
    staleTime: 30_000,
  })

  const lessonPlansQuery = useQuery({
    queryKey: ['lesson-plans', subjectId, quarter],
    queryFn: () => lessonPlanService.listBySubject(subjectId, quarter),
    enabled: !!subjectId,
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
    if (plan) {
      setStartDate(plan.start_date)
      setExamDate(plan.exam_date)
      setMeetingDays((plan.meeting_days ?? []).filter(Boolean) as string[])
      setExcludedDates((plan.excluded_dates ?? []).join(', '))
      setQuizzesCount(plan.quizzes_count ?? 0)
      setAssignmentsCount(plan.assignments_count ?? 0)
      setActivitiesCount(plan.activities_count ?? 0)
      setProjectsCount(plan.projects_count ?? 0)
      return
    }

    // If there's no saved plan for this quarter (and the query isn't loading), reset to defaults.
    if (!quarterPlanQuery.isLoading) {
      setStartDate('')
      setExamDate('')
      setMeetingDays(['monday', 'wednesday', 'friday'])
      setExcludedDates('')
      setQuizzesCount(0)
      setAssignmentsCount(0)
      setActivitiesCount(0)
      setProjectsCount(0)
    }
  }, [quarterPlanQuery.data, quarterPlanQuery.isLoading])

  React.useEffect(() => {
    if (!selectedSubjectEcrId && defaultSubjectEcrId) setSelectedSubjectEcrId(defaultSubjectEcrId)
  }, [defaultSubjectEcrId, selectedSubjectEcrId])

  const savedTopicsForQuarter = useMemo(() => {
    const all = topicsQuery.data ?? []
    return all.filter((t: any) => String(t?.quarter ?? '') === quarter)
  }, [topicsQuery.data, quarter])

  const hasSavedTopics = savedTopicsForQuarter.length > 0
  const savedPlan = (quarterPlanQuery.data as SubjectQuarterPlan | null | undefined) ?? null
  const hasQuarterPlan =
    !!savedPlan &&
    typeof savedPlan.start_date === 'string' &&
    savedPlan.start_date.length > 0 &&
    typeof savedPlan.exam_date === 'string' &&
    savedPlan.exam_date.length > 0 &&
    Array.isArray(savedPlan.meeting_days) &&
    savedPlan.meeting_days.length > 0

  const hasLessonPlans = (lessonPlansQuery.data ?? []).length > 0

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
      await topicsQuery.refetch()
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

  const pollGenerationStatus = async (taskId: string) => {
    const maxAttempts = 120 // 10 minutes max (5s intervals)
    let attempts = 0

    const poll = async (): Promise<void> => {
      if (attempts >= maxAttempts) {
        setError('Generation is taking longer than expected. Please check the Lesson Plan Calendar tab in a few minutes.')
        setGeneratingLessonPlans(false)
        setBusy(false)
        return
      }

      attempts++

      try {
        const task = await aiPlannerService.checkGenerationStatus(taskId)

        if (task.status === 'completed') {
          setSuccess(`Generated ${task.total_items ?? 0} lesson plan entries successfully!`)
          setGeneratingLessonPlans(false)
          setBusy(false)
          setGenerationProgress(0)
          setCurrentTaskId(null)
          await lessonPlansQuery.refetch()
          return
        }

        if (task.status === 'failed') {
          setError(task.error_message ?? 'Failed to generate lesson plans.')
          setGeneratingLessonPlans(false)
          setBusy(false)
          setGenerationProgress(0)
          setCurrentTaskId(null)
          return
        }

        // Still processing
        setGenerationProgress(task.progress_percentage)
        setSuccess(
          `Generating lesson plans... ${task.processed_items ?? 0} of ${task.total_items ?? '?'} completed (${task.progress_percentage}%)`
        )

        // Poll again after 5 seconds
        setTimeout(() => poll(), 5000)
      } catch (e: unknown) {
        console.error('Error polling generation status:', e)
        // Continue polling even if one poll fails
        setTimeout(() => poll(), 5000)
      }
    }

    poll()
  }

  const handleGenerateLessonPlans = async (overwrite: boolean) => {
    setError(null)
    setSuccess(null)
    setBusy(true)
    setGeneratingLessonPlans(true)
    setGenerationProgress(0)
    
    try {
      const result = await aiPlannerService.generateLessonPlans(subjectId, quarter, overwrite)
      setCurrentTaskId(result.task_id)
      setSuccess('Lesson plan generation started. Monitoring progress...')
      
      // Start polling
      await pollGenerationStatus(result.task_id)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) ?? 'Failed to start lesson plan generation.')
      setGeneratingLessonPlans(false)
      setBusy(false)
      setGenerationProgress(0)
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

  const sections = useMemo(() => {
    return [
      {
        id: 'topics',
        title: 'Topics',
        description: 'Generate and save lesson topics for the quarter',
        icon: LightBulbIcon,
        done: hasSavedTopics,
        status: hasSavedTopics ? `${savedTopicsForQuarter.length} saved` : 'Not started',
      },
      {
        id: 'quarterPlan',
        title: 'Quarter Schedule',
        description: 'Set meeting days, dates, and assessment counts',
        icon: CalendarIcon,
        done: hasQuarterPlan,
        status: hasQuarterPlan ? 'Configured' : 'Not configured',
      },
      {
        id: 'lessonPlans',
        title: 'Lesson Plans',
        description: 'Generate daily lesson plans with AI',
        icon: DocumentTextIcon,
        done: hasLessonPlans,
        status: hasLessonPlans ? `${lessonPlansQuery.data?.length ?? 0} generated` : 'Not generated',
      },
      {
        id: 'assessments',
        title: 'Assessment Items',
        description: 'Generate quizzes, assignments, activities, and projects',
        icon: CheckCircleIcon,
        done: false,
        status: 'Ready to generate',
      },
    ]
  }, [hasLessonPlans, hasQuarterPlan, hasSavedTopics, savedTopicsForQuarter.length, lessonPlansQuery.data?.length])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">AI-Powered Quarter Planner</h2>
            <p className="mt-2 text-sm text-gray-600">
              Automatically generate topics, lesson plans, and assessments using AI. Complete each step to build your quarter curriculum.
            </p>
          </div>
        </div>
        
        {/* Quarter Selector */}
        <div className="mt-6 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Select Quarter:</span>
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
                Q{q}
              </Button>
            ))}
          </div>
        </div>

        {/* Progress Summary */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-xs font-medium text-gray-500 uppercase">Topics</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{savedTopicsForQuarter.length}</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-xs font-medium text-gray-500 uppercase">Schedule</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{hasQuarterPlan ? '✓ Configured' : 'Not set'}</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-xs font-medium text-gray-500 uppercase">Lesson Plans</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{lessonPlansQuery.data?.length ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && <Alert type="error" message={error} onClose={() => setError(null)} show />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} show />}

      {/* Expandable Sections */}
      <div className="space-y-4">
        {sections.map((section, idx) => {
          const Icon = section.icon
          const isExpanded = expandedSections[section.id]
          
          return (
            <div
              key={section.id}
              className={[
                'bg-white rounded-xl border-2 transition-all overflow-hidden',
                section.done ? 'border-emerald-200 shadow-sm' : 'border-gray-200',
              ].join(' ')}
            >
              {/* Section Header */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full p-6 flex items-center gap-4 hover:bg-gray-50 transition-colors"
              >
                <div
                  className={[
                    'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center',
                    section.done ? 'bg-emerald-100' : 'bg-indigo-100',
                  ].join(' ')}
                >
                  <Icon className={[
                    'w-6 h-6',
                    section.done ? 'text-emerald-600' : 'text-indigo-600',
                  ].join(' ')} />
                </div>
                
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
                    {section.done && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        ✓ Complete
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{section.description}</p>
                  <div className="mt-2 text-xs font-medium text-gray-500">
                    Status: <span className={section.done ? 'text-emerald-600' : 'text-gray-700'}>{section.status}</span>
                  </div>
                </div>

                {isExpanded ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Section Content */}
              {isExpanded && (
                <div className="border-t border-gray-200 bg-white">
                  <div className="p-6">
                    {section.id === 'topics' && (
                      <div className="space-y-4">
                <Field>
                  <Label htmlFor="topicCount" className="text-gray-900 font-medium">How many topics?</Label>
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

                <div className="flex flex-wrap gap-2">
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
                  <div className="mt-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Generated Suggestions:</div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {topicSuggestions.map((t, idx) => (
                        <div key={idx} className="bg-white rounded-lg border border-gray-300 p-3 hover:border-indigo-300 transition-colors">
                          <div className="font-medium text-gray-900">{t.title}</div>
                          {t.description && <div className="mt-1 text-sm text-gray-600">{t.description}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
                    )}

                    {section.id === 'quarterPlan' && (
                      <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field>
                    <Label htmlFor="startDate" className="text-gray-900 font-medium">Quarter start date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={busy}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="examDate" className="text-gray-900 font-medium">Exam date</Label>
                    <Input id="examDate" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} disabled={busy} />
                  </Field>
                </div>

                <Field>
                  <Label className="text-gray-900 font-medium">Meeting days</Label>
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
                  <Label htmlFor="excludedDates" className="text-gray-900 font-medium">Holidays & School Breaks (comma-separated dates)</Label>
                  <Input
                    id="excludedDates"
                    type="text"
                    placeholder="e.g. 2026-02-10, 2026-02-17, 2026-03-25 (YYYY-MM-DD)"
                    value={excludedDates}
                    onChange={(e) => setExcludedDates(e.target.value)}
                    disabled={busy}
                  />
                  <p className="mt-1 text-xs text-gray-600">Enter dates to skip when generating lesson plans (holidays, school breaks, etc.)</p>
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={handleSaveQuarterPlan} loading={busy}>
                    Save Schedule
                  </Button>
                  {!hasSavedTopics && (
                    <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs text-yellow-800">
                        💡 Tip: Generate and save topics first so lesson plans have proper coverage.
                      </p>
                    </div>
                  )}
                </div>
              </div>
                    )}

                    {section.id === 'lessonPlans' && (
                      <div className="space-y-4">

                {!hasQuarterPlan && (
                  <Alert
                    type="warning"
                    show
                    message="Quarter plan not found for this quarter. Please save the quarter schedule first (Step 2)."
                  />
                )}
                {hasQuarterPlan && !hasSavedTopics && (
                  <Alert
                    type="warning"
                    show
                    message="No topics found for this quarter yet. Save topics first (Step 1) so lesson plans can be generated."
                  />
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => handleGenerateLessonPlans(false)}
                    loading={busy}
                    disabled={busy || !hasQuarterPlan || !hasSavedTopics}
                  >
                    Generate (upsert)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    color="primary"
                    onClick={() => handleGenerateLessonPlans(true)}
                    disabled={busy || !hasQuarterPlan || !hasSavedTopics}
                  >
                    Generate (overwrite)
                  </Button>
                </div>

                {generatingLessonPlans && generationProgress > 0 && (
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-indigo-900">Generating lesson plans...</span>
                      <span className="text-sm font-semibold text-indigo-700">{generationProgress}%</span>
                    </div>
                    <div className="w-full bg-indigo-200 rounded-full h-2.5">
                      <div
                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${generationProgress}%` }}
                      ></div>
                    </div>
                    <p className="mt-2 text-xs text-indigo-700">
                      Please wait while AI generates your lesson plans. This process runs in the background.
                    </p>
                  </div>
                )}

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <p className="text-sm text-blue-800">
                    📅 This will generate one lesson plan per meeting day based on your schedule, topics, and exam date.
                  </p>
                  <p className="text-xs text-blue-700">
                    ⏱️ <strong>Note:</strong> Generation may take 2-5 minutes depending on the number of meeting days. Please be patient and do not close the page.
                  </p>
                </div>
              </div>
                    )}

                    {section.id === 'assessments' && (
                      <div className="space-y-4">

                {!hasQuarterPlan && (
                  <Alert
                    type="warning"
                    show
                    message="Quarter plan not found for this quarter. Please save the quarter schedule first (Step 2) so the generator knows how many items to create."
                  />
                )}

                {subjectEcrComponents.length === 0 ? (
                  <Alert
                    type="warning"
                    show
                    message="No Components of Summative Assessment found. Please set it first in the 'Components of Summative Assessment' tab, then come back here."
                  />
                ) : (
                  <>
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-indigo-900 mb-3">How many assessment items to generate?</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Field>
                          <Label htmlFor="quizzesCount" className="text-gray-900 font-medium">Quizzes</Label>
                          <Input
                            id="quizzesCount"
                            type="number"
                            min={0}
                            value={quizzesCount}
                            onChange={(e) => setQuizzesCount(Number(e.target.value))}
                            disabled={busy}
                          />
                        </Field>
                        <Field>
                          <Label htmlFor="assignmentsCount" className="text-gray-900 font-medium">Assignments</Label>
                          <Input
                            id="assignmentsCount"
                            type="number"
                            min={0}
                            value={assignmentsCount}
                            onChange={(e) => setAssignmentsCount(Number(e.target.value))}
                            disabled={busy}
                          />
                        </Field>
                        <Field>
                          <Label htmlFor="activitiesCount" className="text-gray-900 font-medium">Activities</Label>
                          <Input
                            id="activitiesCount"
                            type="number"
                            min={0}
                            value={activitiesCount}
                            onChange={(e) => setActivitiesCount(Number(e.target.value))}
                            disabled={busy}
                          />
                        </Field>
                        <Field>
                          <Label htmlFor="projectsCount" className="text-gray-900 font-medium">Projects</Label>
                          <Input
                            id="projectsCount"
                            type="number"
                            min={0}
                            value={projectsCount}
                            onChange={(e) => setProjectsCount(Number(e.target.value))}
                            disabled={busy}
                          />
                        </Field>
                      </div>
                      <Button type="button" onClick={handleSaveQuarterPlan} loading={busy} className="mt-4">
                        Save Counts
                      </Button>
                    </div>

                    <Divider soft />

                    <Field>
                      <Label htmlFor="subjectEcrId" className="text-gray-900 font-medium">Save generated items under this assessment component</Label>
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

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => handleGenerateAssessments(false)}
                        loading={busy}
                        disabled={busy || !hasQuarterPlan}
                      >
                        Generate (append)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        color="primary"
                        onClick={() => handleGenerateAssessments(true)}
                        disabled={busy || !hasQuarterPlan}
                      >
                        Generate (overwrite quarter)
                      </Button>
                    </div>
                  </>
                )}
              </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

