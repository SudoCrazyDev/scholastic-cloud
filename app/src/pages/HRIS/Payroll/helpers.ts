export const peso = (amount: number | null | undefined) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0)

export const errorMessage = (err: unknown, fallback: string): string => {
  const response = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response
  const errors = response?.data?.errors
  if (errors) {
    const first = Object.values(errors)[0]
    if (first?.[0]) return first[0]
  }
  return response?.data?.message || fallback
}

export const parseYmd = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-06-01" → "1-Jun" (matches the printed working-time record)
export const dayLabel = (ymd: string): string => {
  const d = parseYmd(ymd)
  return `${d.getDate()}-${MONTHS_SHORT[d.getMonth()]}`
}

export const longDate = (ymd: string | null | undefined): string => {
  if (!ymd) return '—'
  return parseYmd(ymd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export const shortDate = (ymd: string | null | undefined): string => {
  if (!ymd) return '—'
  return parseYmd(ymd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// "08:30" → "8:30 AM"
export const time12 = (time: string | null): string => {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export const numberOrZero = (value: string): number => {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}
