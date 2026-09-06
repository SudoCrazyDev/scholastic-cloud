/**
 * How long ago something happened, in the terms a principal reads it in.
 *
 * "Never" rather than a dash for a teacher with no activity at all: on this
 * screen that is the finding, not missing data.
 */
export function formatWhen(timestamp: string | null) {
  if (!timestamp) return 'Never'

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Never'

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`

  return date.toLocaleDateString()
}
