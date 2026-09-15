import type { StudentRunningGrade } from '../../services/studentRunningGradeService'

/**
 * Which number on a running-grade row is a grade, and which one only looks like
 * one.
 *
 * `student_running_grades` carries two values and they are not interchangeable:
 *
 * - **`grade`** is what `RunningGradeRecalcService` computes from the scores
 *   entered so far — each category's raw percentage times its weight, summed.
 *   It moves every time a teacher saves a score, and mid-term, with half the
 *   class record still empty, it reads 17 or 30 or 47. It is a progress figure
 *   for the teacher's own screen. It is not transmuted, and it is not a grade.
 * - **`final_grade`** is the whole number a teacher deliberately applied from
 *   the class record. That is the grade of record: it is what the class record
 *   submits, what `ParentSubjectGradeService` averages into a parent area, and
 *   what a school stands behind.
 *
 * `gradeUtils.gradeValue` prefers `final_grade` and **falls back to `grade`**,
 * which is defensible on a preview screen a teacher reads and indefensible on a
 * form a parent keeps — it prints a half-finished running percentage in the same
 * cell, in the same type, as a real mark, with nothing to tell them apart. So
 * this form reads `final_grade` and nothing else, and prints an empty cell for a
 * term no one has encoded yet. An empty cell is honest; a 17 is not.
 *
 * Deliberately separate from `gradeUtils` rather than a fix to it: those helpers
 * are shared with the DO 8 card, SF9 and the consolidated-grades screens, and
 * changing them would change what every school's existing report card prints.
 */
const encodedValue = (row: StudentRunningGrade): number => {
    if (row.final_grade === null || row.final_grade === undefined) return 0
    const value = Number(row.final_grade)
    return Number.isFinite(value) && value > 0 ? value : 0
}

/** The encoded grade for one term, or 0 when the term has not been encoded. */
export const encodedTermGrade = (
    grades: StudentRunningGrade[],
    period: string | number
): number => {
    const row = grades.find(
        (grade) => String(grade.quarter) === String(period) || Number(grade.quarter) === Number(period)
    )
    return row ? Math.round(encodedValue(row)) : 0
}

/**
 * Final Grade for a learning area: the mean of its encoded term grades, rounded.
 *
 * Only encoded terms count. A caller that needs "all three terms are in" must
 * check that itself — this returns the average of what exists, so a two-term
 * average and a three-term one are indistinguishable here by design.
 */
export const encodedFinalGrade = (grades: StudentRunningGrade[]): number => {
    const encoded = grades.map(encodedValue).filter((value) => value > 0)
    if (encoded.length === 0) return 0

    const sum = encoded.reduce((total, value) => total + Math.round(value), 0)
    return Math.round(sum / encoded.length)
}
