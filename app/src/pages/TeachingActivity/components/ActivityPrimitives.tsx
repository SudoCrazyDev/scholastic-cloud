import type { ReactNode } from 'react'

/**
 * The small pieces both Teaching Activity screens share: a stat tile, a
 * submission-rate bar, and the "not applicable" dash that a rate of null has
 * to render as.
 */

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'warn'
  icon?: ReactNode
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === 'warn' ? 'text-amber-900' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  )
}

/**
 * A submission rate.
 *
 * `null` means nothing was expected — no published assessment with anything to
 * answer — and is drawn as a dash with an explanation. Rendering it as 0%
 * would accuse a teacher of a class that never handed anything in, when in
 * fact nothing was ever set.
 */
export function RateBar({
  rate,
  received,
  expected,
  className = '',
}: {
  rate: number | null
  received: number
  expected: number
  className?: string
}) {
  if (rate === null || expected === 0) {
    return (
      <span className={`text-sm text-gray-400 ${className}`} title="Nothing set online yet">
        —
      </span>
    )
  }

  const colour = rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className={`min-w-[7.5rem] ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 tabular-nums">{rate}%</span>
        <span className="text-xs text-gray-500 tabular-nums">
          {received}/{expected}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
    </div>
  )
}

/** A count that reads as nothing rather than as zero when it is zero. */
export function Count({ value, of }: { value: number; of?: number }) {
  if (value === 0 && !of) {
    return <span className="text-gray-300">0</span>
  }

  return (
    <span className="tabular-nums text-gray-900">
      {value}
      {of !== undefined ? <span className="text-gray-400">/{of}</span> : null}
    </span>
  )
}

/**
 * The note that a figure was credited by falling back to the subject's
 * adviser. Shown wherever such a figure is, because the alternative is a
 * screen that states a guess as a fact.
 */
export function AttributionNote({ attribution }: { attribution: 'recorded' | 'adviser' }) {
  if (attribution === 'recorded') return null

  return (
    <span
      className="ml-1.5 cursor-help rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500"
      title="Some of this was made before the system recorded who created it, so it is credited to the subject's teacher."
    >
      inferred
    </span>
  )
}
