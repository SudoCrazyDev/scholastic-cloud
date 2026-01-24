import React from 'react'
import { PrinterIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/button'

interface LessonPlanContent {
  kind?: string
  week?: string
  learning_objectives?: string[]
  objectives?: string[] // fallback for old format
  subject_matter?: {
    topic?: string
    materials?: string[]
    references?: string[]
  }
  materials?: string[] // fallback for old format
  procedure?: any
  evaluation?: {
    type?: string
    items?: Array<{
      question: string
      choices?: string[]
      answer?: string
    }>
  }
  assignment?: string
  homework?: string // fallback for old format
}

interface LessonPlanViewerProps {
  title?: string
  date?: string
  quarter?: string
  content?: LessonPlanContent
  subjectTitle?: string
  gradeLevel?: string
  showPrintButton?: boolean
  onPrint?: () => void
}

export const LessonPlanViewer: React.FC<LessonPlanViewerProps> = ({
  title,
  date,
  quarter,
  content,
  subjectTitle,
  gradeLevel,
  showPrintButton = false,
  onPrint,
}) => {
  if (!content) {
    return (
      <div className="text-center py-8 text-gray-500">
        No lesson plan content available.
      </div>
    )
  }

  const objectives = content.learning_objectives || content.objectives || []
  const materials = content.subject_matter?.materials || content.materials || []
  const references = content.subject_matter?.references || []
  const assignment = content.assignment || content.homework || ''

  return (
    <div className="lesson-plan-document bg-white rounded-lg">
      {showPrintButton && (
        <div className="p-4 border-b border-gray-200 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onPrint}
            className="flex items-center gap-2"
          >
            <PrinterIcon className="w-4 h-4" />
            Print / Export PDF
          </Button>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="text-center border-b-2 border-indigo-600 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">
            {title || 'Detailed Lesson Plan'}
          </h1>
          {subjectTitle && (
            <p className="text-lg font-semibold text-indigo-700 mt-2">
              {subjectTitle}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-6 mt-4 text-sm">
            {quarter && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full">
                <strong>Quarter:</strong> {quarter}
              </span>
            )}
            {content.week && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
                <strong>Week:</strong> {content.week}
              </span>
            )}
            {date && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 rounded-full">
                <strong>Date:</strong> {date}
              </span>
            )}
            {gradeLevel && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full">
                <strong>Grade:</strong> {gradeLevel}
              </span>
            )}
          </div>
        </div>

        {/* I. LEARNING OBJECTIVES */}
        {objectives.length > 0 && (
          <div className="bg-indigo-50 rounded-lg p-5 border-l-4 border-indigo-600">
            <h2 className="text-lg font-bold text-indigo-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-indigo-600 text-white rounded-full text-sm font-bold">
                I
              </span>
              LEARNING OBJECTIVES
            </h2>
            <p className="text-sm text-gray-700 mb-3 italic">
              At the end of the lesson, learners are expected to:
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              {objectives.map((obj, idx) => (
                <li key={idx} className="text-sm text-gray-800 leading-relaxed">{obj}</li>
              ))}
            </ol>
          </div>
        )}

        {/* II. SUBJECT MATTER */}
        {(content.subject_matter?.topic || materials.length > 0 || references.length > 0) && (
          <div className="bg-blue-50 rounded-lg p-5 border-l-4 border-blue-600">
            <h2 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full text-sm font-bold">
                II
              </span>
              SUBJECT MATTER
            </h2>
            <div className="space-y-3 ml-2">
              {content.subject_matter?.topic && (
                <p className="text-sm text-gray-800">
                  <strong>Topic:</strong> {content.subject_matter.topic}
                </p>
              )}
              {materials.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Materials:</p>
                  <ul className="list-disc list-inside ml-4 mt-1">
                    {materials.map((mat, idx) => (
                      <li key={idx} className="text-sm text-gray-700">{mat}</li>
                    ))}
                  </ul>
                </div>
              )}
              {references.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">References:</p>
                  <ul className="list-disc list-inside ml-4 mt-1">
                    {references.map((ref, idx) => (
                      <li key={idx} className="text-sm text-gray-700">{ref}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* III. PROCEDURE */}
        {content.procedure && (
          <div className="bg-purple-50 rounded-lg p-5 border-l-4 border-purple-600">
            <h2 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-purple-600 text-white rounded-full text-sm font-bold">
                III
              </span>
              PROCEDURE
            </h2>
            <div className="space-y-4 ml-2">
              {/* A. Introduction */}
              {content.procedure.introduction && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    A. Introduction ({content.procedure.introduction.time_minutes || '10'} minutes)
                  </h3>
                  {content.procedure.introduction.activity_name && (
                    <p className="text-sm text-gray-800 mt-1">
                      <strong>Activity:</strong> '{content.procedure.introduction.activity_name}'
                    </p>
                  )}
                  {content.procedure.introduction.steps && (
                    <ol className="list-decimal list-inside ml-4 mt-2 space-y-1">
                      {content.procedure.introduction.steps.map((step: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-700">{step}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {/* B. Presentation / Discussion */}
              {content.procedure.presentation && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    B. Presentation / Discussion ({content.procedure.presentation.time_minutes || '20'} minutes)
                  </h3>
                  {content.procedure.presentation.discussion_points && (
                    <ol className="list-decimal list-inside ml-4 mt-2 space-y-1">
                      {content.procedure.presentation.discussion_points.map((point: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-700">{point}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {/* C. Guided Practice */}
              {content.procedure.guided_practice && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    C. Guided Practice ({content.procedure.guided_practice.time_minutes || '20'} minutes)
                  </h3>
                  {content.procedure.guided_practice.activity_name && (
                    <p className="text-sm text-gray-800 mt-1">
                      <strong>Activity:</strong> '{content.procedure.guided_practice.activity_name}'
                    </p>
                  )}
                  {content.procedure.guided_practice.instructions && (
                    <ol className="list-decimal list-inside ml-4 mt-2 space-y-1">
                      {content.procedure.guided_practice.instructions.map((instruction: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-700">{instruction}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {/* D. Independent Practice */}
              {content.procedure.independent_practice && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    D. Independent Practice ({content.procedure.independent_practice.time_minutes || '15'} minutes)
                  </h3>
                  {content.procedure.independent_practice.activity_name && (
                    <p className="text-sm text-gray-800 mt-1">
                      <strong>Activity:</strong> '{content.procedure.independent_practice.activity_name}'
                    </p>
                  )}
                  {content.procedure.independent_practice.tasks && (
                    <ol className="list-decimal list-inside ml-4 mt-2 space-y-1">
                      {content.procedure.independent_practice.tasks.map((task: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-700">{task}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {/* E. Generalization */}
              {content.procedure.generalization && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    E. Generalization ({content.procedure.generalization.time_minutes || '5'} minutes)
                  </h3>
                  {content.procedure.generalization.key_questions && (
                    <div className="ml-4 mt-2">
                      <p className="text-sm font-semibold text-gray-800">Ask:</p>
                      <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                        {content.procedure.generalization.key_questions.map((question: string, idx: number) => (
                          <li key={idx} className="text-sm text-gray-700">{question}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Fallback for old simple procedure format */}
              {Array.isArray(content.procedure) && content.procedure.length > 0 && (
                <div>
                  <ol className="list-decimal list-inside space-y-1">
                    {content.procedure.map((step: string, idx: number) => (
                      <li key={idx} className="text-sm text-gray-700">{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}

        {/* IV. EVALUATION */}
        {content.evaluation && content.evaluation.items && content.evaluation.items.length > 0 && (
          <div className="bg-green-50 rounded-lg p-5 border-l-4 border-green-600">
            <h2 className="text-lg font-bold text-green-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-green-600 text-white rounded-full text-sm font-bold">
                IV
              </span>
              EVALUATION
            </h2>
            <div className="ml-2 space-y-3">
              <p className="text-sm font-semibold text-gray-800">
                {content.evaluation.type || 'Multiple Choice'}. Choose the correct answer.
              </p>
              {content.evaluation.items.map((item, idx) => (
                <div key={idx} className="ml-4">
                  <p className="text-sm text-gray-800">
                    <strong>{idx + 1}.</strong> {item.question}
                  </p>
                  {item.choices && item.choices.length > 0 && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {item.choices.map((choice, cIdx) => (
                        <p key={cIdx} className="text-sm text-gray-700">
                          {choice}
                        </p>
                      ))}
                    </div>
                  )}
                  {item.answer && (
                    <p className="text-xs text-green-700 mt-1 ml-6">
                      <strong>Answer:</strong> {item.answer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* V. ASSIGNMENT */}
        {assignment && (
          <div className="bg-orange-50 rounded-lg p-5 border-l-4 border-orange-600">
            <h2 className="text-lg font-bold text-orange-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-orange-600 text-white rounded-full text-sm font-bold">
                V
              </span>
              ASSIGNMENT
            </h2>
            <p className="text-sm text-gray-800 ml-2 leading-relaxed">
              {assignment}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
