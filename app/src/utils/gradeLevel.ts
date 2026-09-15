/**
 * Reading a grade level out of the free text a section carries.
 *
 * `class_sections.grade_level` is a string a school typed, and across tenants it
 * arrives as "Grade 7", "grade 7", "7", "Grade 7 - STEM" and a few worse things.
 * Anything that has to decide *which* grade a section is — not just print it —
 * goes through here rather than parsing it again on the spot.
 */

/**
 * The grade as a number, or null when the text does not name one.
 *
 * Kindergarten, "Nursery", "SPED" and an empty string all return null on
 * purpose: they are not a numbered grade, and a caller deciding what a Grade 2
 * to 10 screen does should treat "no number" as "not this screen" rather than
 * guess.
 */
export function parseGradeLevelNumber(value: unknown): number | null {
  const text = String(value ?? '').trim()
  if (!text) return null

  // The first run of digits, so "Grade 10 - Rizal" reads 10 and "Grade 7" reads
  // 7. Anchored to a word boundary so the 9 in "K-9 Annex" is not mistaken for
  // a grade level that the word "Grade" never introduced.
  const match = text.match(/(?:^|\D)(\d{1,2})(?:\D|$)/)
  if (!match) return null

  const parsed = Number(match[1])
  if (!Number.isFinite(parsed)) return null

  // Basic education only goes to 12. A bigger number is a room number, a year,
  // or a typo — none of which name a grade.
  return parsed >= 1 && parsed <= 12 ? parsed : null
}

/**
 * Is this section one the DepEd Performance Report covers?
 *
 * DepEd Order 15, s. 2026 puts Grades 4 to 10 on this form permanently, and
 * Grades 2 and 3 on it for as long as they are still graded numerically —
 * descriptive grading reaches Grade 2 in SY 2027-2028 and Grade 3 in SY
 * 2028-2029 (DO 15, Table 12). Grade 1 is already on the MATATAG competency
 * grid and has its own progress report; Grades 11 and 12 use the same annex but
 * with Track and elective rows this card does not draw, so they are left out
 * until that form is built.
 */
export function isGradeTwoToTen(gradeLevel: string | null | undefined): boolean {
  const grade = parseGradeLevelNumber(gradeLevel)
  return grade !== null && grade >= 2 && grade <= 10
}
