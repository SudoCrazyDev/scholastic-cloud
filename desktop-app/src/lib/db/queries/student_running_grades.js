import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update a student running grade in the local database
 */
export async function saveStudentRunningGrade(gradeData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO student_running_grades (
        id, student_id, subject_id, quarter, grade, final_grade, academic_year, note, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        student_id = excluded.student_id,
        subject_id = excluded.subject_id,
        quarter = excluded.quarter,
        grade = excluded.grade,
        final_grade = excluded.final_grade,
        academic_year = excluded.academic_year,
        note = excluded.note,
        deleted_at = excluded.deleted_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        gradeData.id,
        gradeData.student_id,
        gradeData.subject_id,
        gradeData.quarter,
        gradeData.grade,
        gradeData.final_grade ?? null,
        gradeData.academic_year,
        gradeData.note ?? null,
        gradeData.deleted_at ?? null,
        gradeData.created_at ?? null,
        gradeData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get all student running grades (for debugging)
 */
export async function getAllStudentRunningGrades() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM student_running_grades WHERE deleted_at IS NULL");
  } catch (error) {
    throw error;
  }
}

/**
 * Get student running grades by student ID
 */
export async function getStudentRunningGradesByStudentId(studentId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM student_running_grades WHERE student_id = ? AND deleted_at IS NULL", [studentId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Get student running grades by subject ID
 */
export async function getStudentRunningGradesBySubjectId(subjectId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM student_running_grades WHERE subject_id = ? AND deleted_at IS NULL", [subjectId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached student running grades (used by Debug Database "Clear Data")
 */
export async function clearStudentRunningGradeCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM student_running_grades");
  } catch (error) {
    throw error;
  }
}

