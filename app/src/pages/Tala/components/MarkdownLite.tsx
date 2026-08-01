import React from 'react'

/**
 * Just enough Markdown for a chat reply.
 *
 * Tala's system prompt asks for light formatting, but models still reach for
 * bold, bullets, short headings and the occasional code block, and raw
 * asterisks on screen look like a bug. This covers those cases and lets
 * anything else through as plain text.
 *
 * Deliberately not a Markdown library: the app has no renderer dependency, and
 * pulling one in for four constructs is not worth the bundle or the audit. It
 * builds React nodes and never touches dangerouslySetInnerHTML, so model
 * output cannot inject markup no matter what it emits.
 */

interface MarkdownLiteProps {
  content: string
}

export const MarkdownLite: React.FC<MarkdownLiteProps> = ({ content }) => (
  <div className="space-y-2 text-sm leading-relaxed text-zinc-800">{renderBlocks(content)}</div>
)

function renderBlocks(content: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = []
  const lines = content.split('\n')

  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let code: { lines: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push(
      <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
        {renderInline(paragraph.join('\n'))}
      </p>
    )
    paragraph = []
  }

  const flushList = () => {
    if (!list) return

    const items = list.items.map((item, index) => (
      <li key={index} className="pl-1">
        {renderInline(item)}
      </li>
    ))

    blocks.push(
      list.ordered ? (
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      )
    )

    list = null
  }

  for (const line of lines) {
    // Fenced code — everything inside is verbatim, including blank lines and
    // anything that would otherwise look like markup.
    // The language hint is matched but not used — there is no highlighter here
    // and the fence has to be recognised either way.
    const fence = /^```\w*\s*$/.test(line)

    if (fence) {
      if (code) {
        blocks.push(
          <pre
            key={`code-${blocks.length}`}
            className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100"
          >
            <code>{code.lines.join('\n')}</code>
          </pre>
        )
        code = null
      } else {
        flushParagraph()
        flushList()
        code = { lines: [] }
      }
      continue
    }

    if (code) {
      code.lines.push(line)
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/)

    if (heading) {
      flushParagraph()
      flushList()
      blocks.push(
        <p key={`h-${blocks.length}`} className="font-semibold text-zinc-900">
          {renderInline(heading[1])}
        </p>
      )
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)

    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)

      // A list that switches marker style starts a new list rather than
      // silently mixing the two.
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }

      list.items.push((bullet?.[1] ?? numbered?.[1]) as string)
      continue
    }

    flushList()
    paragraph.push(line)
  }

  // An unterminated fence still has to render — a stream cut off mid-block
  // should show the code so far, not swallow it.
  if (code) {
    blocks.push(
      <pre
        key={`code-${blocks.length}`}
        className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100"
      >
        <code>{code.lines.join('\n')}</code>
      </pre>
    )
  }

  flushParagraph()
  flushList()

  return blocks
}

/**
 * Inline `**bold**` and `` `code` ``, in one pass so neither can swallow the
 * other's delimiters.
 */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g

  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }

    const token = match[0]

    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`b-${match.index}`} className="font-semibold text-zinc-900">
          {token.slice(2, -2)}
        </strong>
      )
    } else {
      nodes.push(
        <code key={`c-${match.index}`} className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>
      )
    }

    cursor = match.index + token.length
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

export default MarkdownLite
