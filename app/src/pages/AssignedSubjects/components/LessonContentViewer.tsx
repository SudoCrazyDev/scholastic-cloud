import React from 'react'
import clsx from 'clsx'
import {
  PlayCircleIcon,
  DocumentArrowDownIcon,
  AcademicCapIcon,
  PencilSquareIcon,
  BookOpenIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  DocumentTextIcon,
  PhotoIcon,
  FilmIcon,
  MusicalNoteIcon,
} from '@heroicons/react/24/outline'
import type { LessonBlock, AssessmentBlock, FileBlock } from '../../../types'
import { RichTextEditor } from './RichTextEditor'

interface LessonContentViewerProps {
  blocks: LessonBlock[]
  /** When provided, assessment blocks render a CTA that calls this with the assessment id. */
  onOpenAssessment?: (assessmentId: string) => void
  /**
   * 'scroll' (default) renders every block in one column.
   * 'stepper' renders one section at a time with prev/next navigation,
   * a progress bar, and clickable section pills.
   */
  mode?: 'scroll' | 'stepper'
  /** Stepper only: section to open first (e.g. resume position). Clamped to range. */
  initialIndex?: number
  /** Stepper only: fires whenever the visible section changes — use to persist resume position. */
  onSectionChange?: (index: number) => void
  /** Stepper only: fires with (visitedCount, total) — use to gate "Mark as complete". */
  onProgressChange?: (visited: number, total: number) => void
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

type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'other'

/** Classify an uploaded file by mime first, then by filename extension. */
const fileKind = (block: FileBlock): FileKind => {
  const mime = (block.mime || '').toLowerCase()
  const name = (block.name || block.path || '').toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop()! : ''

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image'
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)) return 'video'
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'oga'].includes(ext)) return 'audio'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  return 'other'
}

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>

/** Icon representing a block's content — used in the stepper section pills. */
const blockIcon = (block: LessonBlock): IconType => {
  if (block.type === 'rich_text') return DocumentTextIcon
  if (block.type === 'video') return PlayCircleIcon
  if (block.type === 'assessment') return assessmentMeta(block.assessmentType).icon
  switch (fileKind(block)) {
    case 'image':
      return PhotoIcon
    case 'video':
      return FilmIcon
    case 'audio':
      return MusicalNoteIcon
    case 'pdf':
      return BookOpenIcon
    default:
      return DocumentArrowDownIcon
  }
}

/** Short human label for a block — shown next to "Section x of y" in the stepper. */
const blockLabel = (block: LessonBlock): string => {
  if (block.type === 'rich_text') return 'Reading'
  if (block.type === 'video') return block.title || 'Video'
  if (block.type === 'assessment') {
    const meta = assessmentMeta(block.assessmentType)
    return block.title ? `${meta.label}: ${block.title}` : meta.label
  }
  switch (fileKind(block)) {
    case 'image':
      return block.name || 'Image'
    case 'video':
      return block.name || 'Video'
    case 'audio':
      return block.name || 'Audio'
    case 'pdf':
      return block.name || 'PDF'
    default:
      return block.name || 'File'
  }
}

/**
 * Wraps embedded media with a native-fullscreen toggle. Children receive the
 * current fullscreen state so they can swap their sizing classes.
 */
const Fullscreenable: React.FC<{
  className?: string
  children: (isFullscreen: boolean) => React.ReactNode
}> = ({ className, children }) => {
  const ref = React.useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  React.useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = () => {
    if (document.fullscreenElement === ref.current) {
      void document.exitFullscreen()
    } else {
      void ref.current?.requestFullscreen?.()
    }
  }

  return (
    <div
      ref={ref}
      className={clsx('group relative', isFullscreen && 'flex items-center justify-center bg-black', className)}
    >
      {children(isFullscreen)}
      <button
        type="button"
        onClick={toggle}
        className="absolute right-2 top-2 z-10 rounded-md bg-gray-900/60 p-1.5 text-white opacity-0 transition hover:bg-gray-900/80 focus:opacity-100 group-hover:opacity-100"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <ArrowsPointingInIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
      </button>
    </div>
  )
}

/** Renders a single lesson block. Shared by the scroll and stepper layouts. */
const LessonBlockView: React.FC<{
  block: LessonBlock
  onOpenAssessment?: (assessmentId: string) => void
}> = ({ block, onOpenAssessment }) => {
  if (block.type === 'rich_text') {
    // Text stays at a readable measure even when the page column is wider.
    return (
      <div className="mx-auto w-full max-w-3xl">
        <RichTextEditor value={block.html} editable={false} />
      </div>
    )
  }

  if (block.type === 'video') {
    const embed = toEmbedUrl(block.url)
    return (
      <div className="space-y-2">
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
    const kind = fileKind(block)
    const caption = (
      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
        <span className="truncate">
          {block.name}
          {formatSize(block.size) ? ` · ${formatSize(block.size)}` : ''}
        </span>
        <a
          href={block.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /> Open
        </a>
      </div>
    )

    if (kind === 'image') {
      return (
        <figure className="space-y-1.5">
          <Fullscreenable>
            {(isFullscreen) => (
              <a href={block.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={block.url}
                  alt={block.name}
                  loading="lazy"
                  className={
                    isFullscreen
                      ? 'max-h-screen w-auto object-contain'
                      : 'max-h-[70vh] w-full rounded-xl border border-gray-200 bg-gray-50 object-contain'
                  }
                />
              </a>
            )}
          </Fullscreenable>
          {caption}
        </figure>
      )
    }

    if (kind === 'video') {
      return (
        <div className="space-y-1.5">
          <video
            src={block.url}
            controls
            preload="metadata"
            className="max-h-[70vh] w-full rounded-xl border border-gray-200 bg-black"
          />
          {caption}
        </div>
      )
    }

    if (kind === 'audio') {
      return (
        <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3">
          <audio src={block.url} controls preload="metadata" className="w-full" />
          {caption}
        </div>
      )
    }

    if (kind === 'pdf') {
      return (
        <div className="space-y-1.5">
          <Fullscreenable>
            {(isFullscreen) => (
              <iframe
                src={block.url}
                title={block.name}
                className={
                  isFullscreen
                    ? 'h-screen w-screen'
                    : 'h-[70vh] w-full rounded-xl border border-gray-200 bg-gray-50'
                }
              />
            )}
          </Fullscreenable>
          {caption}
        </div>
      )
    }

    // Non-previewable files (docs, slides, spreadsheets) — keep the download card.
    return (
      <a
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
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
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
}

/** One-section-at-a-time layout with progress bar, section pills, and prev/next. */
const StepperViewer: React.FC<{
  blocks: LessonBlock[]
  onOpenAssessment?: (assessmentId: string) => void
  initialIndex?: number
  onSectionChange?: (index: number) => void
  onProgressChange?: (visited: number, total: number) => void
}> = ({ blocks, onOpenAssessment, initialIndex = 0, onSectionChange, onProgressChange }) => {
  const clamp = (i: number) => Math.min(Math.max(i, 0), blocks.length - 1)
  const [index, setIndex] = React.useState(() => clamp(initialIndex))
  const [visited, setVisited] = React.useState<Set<number>>(() => new Set([clamp(initialIndex)]))

  React.useEffect(() => {
    setVisited((prev) => {
      if (prev.has(index)) return prev
      const next = new Set(prev)
      next.add(index)
      return next
    })
    onSectionChange?.(index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  React.useEffect(() => {
    onProgressChange?.(visited.size, blocks.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visited, blocks.length])

  const block = blocks[index]
  const pct = Math.round((visited.size / blocks.length) * 100)
  const isFirst = index === 0
  const isLast = index === blocks.length - 1

  return (
    <div className="space-y-4">
      {/* Section navigator */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
            Section {index + 1} of {blocks.length}
            <span className="ml-2 font-normal text-gray-500">{blockLabel(block)}</span>
          </p>
          <span className="shrink-0 text-xs text-gray-500">{pct}% viewed</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {blocks.map((b, i) => {
            const Icon = blockIcon(b)
            const isCurrent = i === index
            const isVisited = visited.has(i)
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setIndex(i)}
                title={blockLabel(b)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  isCurrent
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : isVisited
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                )}
              >
                {isVisited && !isCurrent ? <CheckIcon className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>

      {/* Current section */}
      <div className="min-h-[16rem]">
        <LessonBlockView block={block} onOpenAssessment={onOpenAssessment} />
      </div>

      {/* Prev / next */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => setIndex((i) => clamp(i - 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Previous
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => setIndex((i) => clamp(i + 1))}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export const LessonContentViewer: React.FC<LessonContentViewerProps> = ({
  blocks,
  onOpenAssessment,
  mode = 'scroll',
  initialIndex,
  onSectionChange,
  onProgressChange,
}) => {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
        This lesson has no content yet.
      </div>
    )
  }

  if (mode === 'stepper') {
    return (
      <StepperViewer
        blocks={blocks}
        onOpenAssessment={onOpenAssessment}
        initialIndex={initialIndex}
        onSectionChange={onSectionChange}
        onProgressChange={onProgressChange}
      />
    )
  }

  return (
    <div className="space-y-5">
      {blocks.map((block) => (
        <LessonBlockView key={block.id} block={block} onOpenAssessment={onOpenAssessment} />
      ))}
    </div>
  )
}

export default LessonContentViewer
