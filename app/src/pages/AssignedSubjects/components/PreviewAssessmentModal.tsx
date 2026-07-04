import React from 'react'
import {
  XMarkIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  ArrowUpTrayIcon,
  PhotoIcon,
  VideoCameraIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import type { AssessmentMethod } from '@/services/assessmentMethodService'
import { Button } from '@/components/button'

interface PreviewAssessmentModalProps {
  method: AssessmentMethod
  onClose: () => void
}

/**
 * Read-only preview of an assessment method rendered exactly the way students
 * see it while taking it. All inputs are disabled and the submit button is
 * inert — this is purely a "view as student" preview for teachers/admins.
 */
export const PreviewAssessmentModal: React.FC<PreviewAssessmentModalProps> = ({ method, onClose }) => {
  const questions = method.questions
  const maxScore = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/50">
      <div className="absolute inset-0 flex flex-col bg-gray-50">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-indigo-50 via-white to-white px-6 py-4">
          <div className="flex items-center gap-2">
            <EyeIcon className="h-5 w-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Student Preview</h3>
              <p className="text-sm text-gray-500">This is what students see when taking this assessment.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            title="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-6 p-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <DocumentTextIcon className="h-6 w-6 text-indigo-600" />
                <h1 className="text-xl font-bold text-gray-900">{method.title || 'Assessment'}</h1>
              </div>
              {method.description && <p className="mb-4 text-sm text-gray-600">{method.description}</p>}
              <p className="text-sm text-gray-500">
                {method.quarter && <span>Quarter {method.quarter}</span>}
                <span> · Max score: {maxScore}</span>
              </p>
            </div>

            {questions.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
                This assessment has no questions yet.
              </div>
            ) : (
              <div className="space-y-6">
                {questions.map((q, idx) => {
                  const type = q.type
                  return (
                    <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                      <p className="mb-3 font-medium text-gray-900">
                        <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                          {idx + 1}
                        </span>
                        {q.prompt}
                      </p>
                      <div className="ml-10 space-y-2">
                        {type === 'true_false' &&
                          ['True', 'False'].map((opt) => (
                            <label
                              key={opt}
                              className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-gray-200 p-3"
                            >
                              <input type="radio" disabled className="text-indigo-600" />
                              <span className="text-gray-800">{opt}</span>
                            </label>
                          ))}
                        {type === 'single_choice' &&
                          q.choices?.map((choice, cIdx) => (
                            <label
                              key={cIdx}
                              className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-gray-200 p-3"
                            >
                              <input type="radio" disabled className="text-indigo-600" />
                              <span className="text-gray-800">{choice}</span>
                            </label>
                          ))}
                        {type === 'multiple_choice' &&
                          q.choices?.map((choice, cIdx) => (
                            <label
                              key={cIdx}
                              className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-gray-200 p-3"
                            >
                              <input type="checkbox" disabled className="rounded border-gray-300 text-indigo-600" />
                              <span className="text-gray-800">{choice}</span>
                            </label>
                          ))}
                        {type === 'fill_in_the_blanks' && (
                          <div className="space-y-2">
                            {Array.from({ length: Math.max(q.blanks.length, 1) }, (_, bIdx) => (
                              <div key={bIdx}>
                                <label className="mb-1 block text-xs text-gray-500">Blank {bIdx + 1}</label>
                                <input
                                  type="text"
                                  disabled
                                  className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
                                  placeholder={`Answer ${bIdx + 1}`}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {type === 'short_answer' && (
                          <div>
                            <label className="mb-1 block text-xs text-gray-500">Your answer</label>
                            <input
                              type="text"
                              disabled
                              className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
                              placeholder="Write your answer"
                            />
                          </div>
                        )}
                        {type === 'essay' && (
                          <div>
                            <label className="mb-1 block text-xs text-gray-500">Your answer</label>
                            <textarea
                              disabled
                              className="min-h-32 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
                              placeholder="Write your detailed response"
                            />
                          </div>
                        )}
                        {(type === 'image_upload' || type === 'video_upload') && (
                          <div className="space-y-3">
                            {q.sampleAnswer && <p className="text-sm text-gray-600">{q.sampleAnswer}</p>}
                            <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-400">
                              {type === 'image_upload' ? (
                                <PhotoIcon className="h-4 w-4" />
                              ) : (
                                <VideoCameraIcon className="h-4 w-4" />
                              )}
                              <ArrowUpTrayIcon className="h-4 w-4" />
                              Upload {type === 'image_upload' ? 'image' : 'video'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button disabled className="inline-flex items-center gap-2">
                <PaperAirplaneIcon className="h-4 w-4" />
                Submit
              </Button>
            </div>
            <p className="pb-4 text-center text-xs text-gray-400">
              Preview mode — submission is disabled.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PreviewAssessmentModal
