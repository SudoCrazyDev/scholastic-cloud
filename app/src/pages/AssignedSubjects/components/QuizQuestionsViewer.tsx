import React from 'react'
import { DocumentTextIcon } from '@heroicons/react/24/outline'

interface Question {
  question: string
  choices?: string[]
  answer?: string | string[]
}

interface QuizQuestionsViewerProps {
  questions?: Question[]
  showAnswers?: boolean
  title?: string
}

export const QuizQuestionsViewer: React.FC<QuizQuestionsViewerProps> = ({
  questions,
  showAnswers = false,
  title = 'Quiz Questions',
}) => {
  if (!questions || questions.length === 0) {
    return null
  }

  return (
    <div className="mt-4 border-2 border-indigo-200 rounded-lg bg-white shadow-sm">
      <div className="px-5 py-4 border-b-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50">
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="w-6 h-6 text-indigo-600" />
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <span className="ml-auto text-xs font-semibold px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full">
            {questions.length} {questions.length === 1 ? 'question' : 'questions'}
          </span>
        </div>
      </div>
      
      <div className="p-5 space-y-5 bg-gradient-to-b from-white to-gray-50">
        {questions.map((q, idx) => (
          <div key={idx} className="bg-white border-l-4 border-indigo-400 rounded-r-lg shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-sm font-semibold text-gray-900 mb-3 leading-relaxed">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-indigo-600 text-white rounded-full text-xs font-bold mr-2">
                {idx + 1}
              </span>
              {q.question}
            </p>
            
            {q.choices && q.choices.length > 0 && (
              <div className="ml-9 space-y-2">
                {q.choices.map((choice, cIdx) => {
                  const ans = q.answer;
                  const correctLetters = Array.isArray(ans) ? ans : ans ? [ans] : [];
                  const isCorrect = showAnswers && correctLetters.some((a) => choice.startsWith(String(a) + '.') || choice.startsWith(String(a) + ')'))
                  return (
                    <div
                      key={cIdx}
                      className={`text-sm px-3 py-2 rounded-lg transition-all ${
                        isCorrect
                          ? 'font-semibold text-green-800 bg-green-100 border-2 border-green-500 shadow-sm'
                          : 'text-gray-700 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      {choice}
                      {isCorrect && (
                        <span className="ml-2 inline-flex items-center gap-1 text-green-700">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Correct
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            
            {showAnswers && q.answer && (!q.choices || q.choices.length === 0) && (
              <p className="text-sm text-green-800 mt-2 ml-9 font-semibold bg-green-50 px-3 py-1 rounded inline-block">
                ✓ Answer: {Array.isArray(q.answer) ? q.answer.join(', ') : q.answer}
              </p>
            )}
          </div>
        ))}
      </div>
      
      {!showAnswers && (
        <div className="px-5 py-3 bg-gradient-to-r from-amber-50 to-yellow-50 border-t-2 border-amber-200">
          <p className="text-xs text-amber-900 flex items-center gap-2">
            <span className="text-lg">💡</span>
            <span><strong>Note:</strong> Answers are hidden from students. Teachers can view answers in edit mode.</span>
          </p>
        </div>
      )}
    </div>
  )
}
