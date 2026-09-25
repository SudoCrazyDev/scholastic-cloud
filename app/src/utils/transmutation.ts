/**
 * DepEd's transmutation table for SY 2026-2027 under DO 15, s. 2026: the
 * Initial Grade a class record computes, turned into the grade a report card
 * prints. An Initial Grade of 70.00 transmutes to 75, the passing mark, and
 * the floor is 60.
 *
 * Each row holds the lowest Initial Grade that earns its transmuted grade, as
 * the table prints it (e.g. 99.50–100.00 → 100). Highest first, so a lookup
 * returns on the first row the grade reaches — which also covers the hairline
 * between one printed range and the next (99.495 is still a 99).
 */
const TRANSMUTATION_TABLE: { min: number; grade: number }[] = [
  { min: 99.5, grade: 100 },
  { min: 98.32, grade: 99 },
  { min: 97.14, grade: 98 },
  { min: 95.96, grade: 97 },
  { min: 94.78, grade: 96 },
  { min: 93.6, grade: 95 },
  { min: 92.42, grade: 94 },
  { min: 91.24, grade: 93 },
  { min: 90.06, grade: 92 },
  { min: 88.88, grade: 91 },
  { min: 87.7, grade: 90 },
  { min: 86.52, grade: 89 },
  { min: 85.34, grade: 88 },
  { min: 84.16, grade: 87 },
  { min: 82.98, grade: 86 },
  { min: 81.8, grade: 85 },
  { min: 80.62, grade: 84 },
  { min: 79.44, grade: 83 },
  { min: 78.26, grade: 82 },
  { min: 77.08, grade: 81 },
  { min: 75.9, grade: 80 },
  { min: 74.72, grade: 79 },
  { min: 73.54, grade: 78 },
  { min: 72.36, grade: 77 },
  { min: 71.18, grade: 76 },
  { min: 70.0, grade: 75 },
  { min: 65.34, grade: 74 },
  { min: 60.67, grade: 73 },
  { min: 56.01, grade: 72 },
  { min: 51.34, grade: 71 },
  { min: 46.67, grade: 70 },
  { min: 42.01, grade: 69 },
  { min: 37.34, grade: 68 },
  { min: 32.68, grade: 67 },
  { min: 28.01, grade: 66 },
  { min: 23.35, grade: 65 },
  { min: 18.68, grade: 64 },
  { min: 14.01, grade: 63 },
  { min: 9.35, grade: 62 },
  { min: 4.68, grade: 61 },
  { min: 0, grade: 60 },
]

/**
 * The one school year the table is for. Before it, a school's own grading
 * stands; from SY 2027-2028 DO 15 drops transmutation altogether.
 */
const TRANSMUTATION_YEAR = '2026-2027'

/** Whether grades filed under this school year are transmuted. */
export function transmutesIn(academicYear: string | null | undefined): boolean {
  return academicYear === TRANSMUTATION_YEAR
}

/** The transmuted grade for an Initial Grade, or null when there is none. */
export function transmuteGrade(initial: number | null | undefined): number | null {
  if (initial == null || !Number.isFinite(initial) || initial < 0) return null
  return TRANSMUTATION_TABLE.find((row) => initial >= row.min)?.grade ?? null
}
