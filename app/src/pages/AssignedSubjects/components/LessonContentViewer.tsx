import React from 'react'
import {
  PlayCircleIcon,
  DocumentArrowDownIcon,
  AcademicCapIcon,
  PencilSquareIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import type { LessonBlock, AssessmentBlock } from '../../../types'
import { RichTextEditor } from './RichTextEditor'

interface LessonContentViewerProps {
  blocks: LessonBlock[]
  /** When provided, assessment blocks render a CTA that calls this with the assessment id. */
  onOpenAssessment?: (assessmentId: string) => void
}

/**
 * Convert a YouTube / Vimeo (or generic) URL into an embeddable src.
 * Falls back to the original URL if no known provider matches.
 */
export const toEmbedUrl = (url: string): string | null => {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
      if (u.pathname.startsWith('/embed/')) return url
      if (u.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}`
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop()
      if (id) return `https://player.vimeo.com/video/${id}`
    }
    return url
  } catch {
    return null
  }
}

/**
 * Plain-text excerpt from rich-text HTML — for list-card previews where
 * rendering full markup would be noisy.
 */
export const stripHtml = (html?: string): string => {
  if (!html) return ''
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

const assessmentMeta = (type?: AssessmentBlock['assessmentType']) => {
  switch (type) {
    case 'assignment':
      return { label: 'Assignment', icon: PencilSquareIcon, accent: 'text-emerald-700 bg-emerald-100' }
    case 'exam':
      return { label: 'Exam', icon: BookOpenIcon, accent: 'text-violet-700 bg-violet-100' }
    default:
      return { label: 'Quiz', icon: AcademicCapIcon, accent: 'text-indigo-700 bg-indigo-100' }
  }
}

const formatSize = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const LessonContentViewer: React.FC<LessonContentViewerProps> = ({ blocks, onOpenAssessment }) => {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
        This lesson has no content yet.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {blocks.map((block) => {
        if (block.type === 'rich_text') {
          return <RichTextEditor key={block.id} value={block.html} editable={false} />
        }

        if (block.type === 'video') {
          const embed = toEmbedUrl(block.url)
          return (
            <div key={block.id} className="space-y-2">
              {block.title && <h4 className="text-sm font-semibold text-gray-900">{block.title}</h4>}
              {embed ? (
                <div className="relative w-full overflow-hidden rounded-xl border border-gray-200" style={{ paddingTop: '56.25%' }}>
                  <iframe
                    src={embed}
                    title={block.title || 'Lesson video'}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <a href={block.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-indigo-600 underline">
                  <PlayCircleIcon className="h-5 w-5" /> {block.url}
                </a>
              )}
            </div>
          )
        }

        if (block.type === 'file') {
          return (
            <a
              key={block.id}
              href={block.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-indigo-300 hover:bg-indigo-50"
            >
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                <DocumentArrowDownIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{block.name}</p>
                <p className="text-xs text-gray-500">{formatSize(block.size)} · Click to open</p>
              </div>
            </a>
          )
        }

        if (block.type === 'assessment') {
          const meta = assessmentMeta(block.assessmentType)
          const Icon = meta.icon
          const unavailable = block.assessment_available === false
          return (
            <div key={block.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className={`rounded-lg p-2 ${meta.accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{meta.label}</p>
                <p className="truncate text-sm font-semibold text-gray-900">{block.title || 'Linked assessment'}</p>
              </div>
              {onOpenAssessment ? (
                <button
                  type="button"
                  disabled={unavailable}
                  onClick={() => onOpenAssessment(block.subject_ecr_item_id)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {unavailable ? 'Unavailable' : 'Start'}
                </button>
              ) : (
                <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-500">Linked</span>
              )}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

export default LessonContentViewer
