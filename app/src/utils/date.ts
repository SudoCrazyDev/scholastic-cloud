/**
 * Helpers for date-only values (e.g. birthdate) stored as "YYYY-MM-DD".
 *
 * `new Date("2010-05-15")` parses the string as UTC midnight, so rendering it
 * with toLocaleDateString() in a timezone offset from UTC shifts the day. These
 * helpers parse the date as local wall-clock time so the day is preserved.
 */

/** Parse a date-only string ("YYYY-MM-DD" or an ISO string) as a local Date. */
export const parseDateOnly = (value: string | null | undefined): Date | null => {
  if (!value) return null
  const datePart = value.split('T')[0]
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Format a date-only value without a timezone-induced day shift. */
export const formatDateOnly = (
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
  locale?: string,
): string => {
  const d = parseDateOnly(value)
  if (!d) return ''
  return d.toLocaleDateString(locale, options)
}
