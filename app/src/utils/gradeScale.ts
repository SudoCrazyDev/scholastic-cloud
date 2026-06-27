import type { GradingScale, GradingScaleBand } from '../types'

export interface GradeBandLike {
  label: string
  min_score: number
  max_score: number
}

/**
 * Map a numeric score to the label of the band whose [min, max] range contains it.
 * Returns null when no band matches or there are no bands.
 */
export function mapScoreToLabel(
  score: number | null | undefined,
  bands: GradeBandLike[] | null | undefined,
): string | null {
  if (score === null || score === undefined || !bands || bands.length === 0) return null
  const numeric = Number(score)
  if (Number.isNaN(numeric)) return null
  for (const band of bands) {
    if (numeric >= Number(band.min_score) && numeric <= Number(band.max_score)) {
      return band.label
    }
  }
  return null
}

/**
 * Format a numeric grade together with its mapped letter for non-numerical subjects.
 * "Show both" style: e.g. "A- (91)". Falls back to the numeric value when no letter maps.
 */
export function formatGradeWithLetter(
  score: number | null | undefined,
  bands: GradeBandLike[] | null | undefined,
): string {
  if (score === null || score === undefined || score === ('' as unknown)) return '-'
  const numeric = Number(score)
  if (Number.isNaN(numeric)) return '-'
  const label = mapScoreToLabel(numeric, bands)
  return label ? `${label} (${numeric})` : `${numeric}`
}

/** True when the subject uses a non-numerical grading scale. */
export function isNonNumerical(gradingType?: string | null): boolean {
  return gradingType === 'non_numerical'
}

/** Convenience: pull the bands array off a GradingScale (handles null). */
export function bandsOf(scale?: GradingScale | null): GradingScaleBand[] {
  return scale?.bands ?? []
}
