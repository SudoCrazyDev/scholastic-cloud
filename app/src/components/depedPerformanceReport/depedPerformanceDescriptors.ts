/**
 * The descriptor band DepEd Order 15, s. 2026 puts against a numeric grade.
 *
 * Table 11 of the Order ("Qualitative Descriptors of Numeric Grades"), and the
 * legend printed at the foot of the Annex G form. These replace the
 * Outstanding / Very Satisfactory / Satisfactory / Fairly Satisfactory / Did Not
 * Meet Expectations wording of DO 8, s. 2015, which the existing report card
 * still prints and which this file deliberately does not touch — a school runs
 * both cards during the changeover.
 *
 * The Filipino names are DepEd's own and are carried verbatim.
 */

export interface PerformanceDescriptorBand {
  /** Inclusive lower bound of the band. */
  min: number
  /** Inclusive upper bound. */
  max: number
  /** As printed in the legend, e.g. '90-100'. */
  scale: string
  /** English descriptor, e.g. 'Advancing'. */
  description: string
  /** DepEd's Filipino name for the same band. */
  filipino: string
  /** 'Passed' or 'Failed', as the legend's third column has it. */
  remarks: string
}

/**
 * Highest band first, so a lookup can return on the first match.
 *
 * The passing mark stays 75, as it was: DO 15 raises the *raw* score needed to
 * reach it (an Initial Grade of 70.00 transmutes to 75 for SY 2026-2027, and
 * from SY 2027-2028 the transmutation goes away entirely), but 75 on the card
 * still means the learner met the standard.
 */
export const PERFORMANCE_DESCRIPTOR_BANDS: PerformanceDescriptorBand[] = [
  { min: 90, max: 100, scale: '90-100', description: 'Advancing', filipino: 'Namumukod-tangi', remarks: 'Passed' },
  { min: 80, max: 89, scale: '80-89', description: 'Benchmarking', filipino: 'Napamamalas', remarks: 'Passed' },
  { min: 75, max: 79, scale: '75-79', description: 'Connecting', filipino: 'Natutungo', remarks: 'Passed' },
  { min: 65, max: 74, scale: '65-74', description: 'Developing', filipino: 'Napauunlad', remarks: 'Failed' },
  { min: 0, max: 64, scale: '0-64', description: 'Emerging', filipino: 'Nagsisimula', remarks: 'Failed' },
]

/** The band a grade falls in, or null when there is no grade to describe. */
export function performanceDescriptorFor(grade: number | null | undefined): PerformanceDescriptorBand | null {
  if (grade == null || !Number.isFinite(grade) || grade <= 0) return null
  return PERFORMANCE_DESCRIPTOR_BANDS.find((band) => grade >= band.min && grade <= band.max) ?? null
}
