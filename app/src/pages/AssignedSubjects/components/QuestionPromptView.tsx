import React from 'react'
import clsx from 'clsx'
import 'quill/dist/quill.snow.css'

// Prompts created before the WYSIWYG editor are plain text; only strings that
// actually contain markup go through the HTML path.
const HTML_PATTERN = /<[a-z][\s\S]*>/i

interface QuestionPromptViewProps {
  prompt?: string
  className?: string
}

/**
 * Displays a question prompt authored in the WYSIWYG editor. Rich prompts are
 * rendered as HTML with Quill's editor styles (so lists, headings and images
 * look the same as while authoring); legacy plain-text prompts render as-is.
 */
export const QuestionPromptView: React.FC<QuestionPromptViewProps> = ({ prompt, className }) => {
  if (!prompt) return null
  if (!HTML_PATTERN.test(prompt)) {
    return <div className={className}>{prompt}</div>
  }
  return (
    <div
      className={clsx('ql-editor question-prompt-view', className)}
      dangerouslySetInnerHTML={{ __html: prompt }}
    />
  )
}

export default QuestionPromptView
