import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";
import { addToSyncQueue } from "./sync_queue";

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create a new student running grade
 */
export async function createStudentRunningGrade(gradeData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    const id = generateUUID();
    const now = new Date().toISOString();

    await db.execute(
      `
      INSERT INTO student_running_grades (
        id, student_id, subject_id, quarter, grade, final_grade, academic_year, note, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        gradeData.student_id,
        gradeData.subject_id,
        gradeData.quarter,
        gradeData.grade ?? 0, // Default to 0 if not provided
        gradeData.final_grade ?? null,
        gradeData.academic_year || "2025-2026",
        gradeData.note ?? null,
        null, // deleted_at
        now,
        now,
      ]
    );

    const result = {
      id,
      student_id: gradeData.student_id,
      subject_id: gradeData.subject_id,
      quarter: gradeData.quarter,
      grade: gradeData.grade ?? 0,
      final_grade: gradeData.final_grade ?? null,
      academic_year: gradeData.academic_year || "2025-2026",
      note: gradeData.note ?? null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };

    // Add to sync queue
    await addToSyncQueue('student_running_grades', id, 'create', result);

    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Update an existing student running grade
 */
export async function updateStudentRunningGrade(id, gradeData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    const now = new Date().toISOString();

    await db.execute(
      `
      UPDATE student_running_grades
      SET final_grade = ?, note = ?, updated_at = ?
      WHERE id = ?
      `,
      [gradeData.final_grade ?? null, gradeData.note ?? null, now, id]
    );

    // Fetch and return the updated grade
    const result = await db.select(
      "SELECT * FROM student_running_grades WHERE id = ?",
      [id]
    );

    if (result.length === 0) {
      throw new Error("Running grade not found after update");
    }

    // Add to sync queue
    await addToSyncQueue('student_running_grades', id, 'update', result[0]);

    return result[0];
  } catch (error) {
    throw error;
  }
}

/**
 * Upsert (create or update) a student running grade
 */
export async function upsertStudentRunningGrade(gradeData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    // Check if record exists
    const existing = await db.select(
      `SELECT * FROM student_running_grades 
       WHERE student_id = ? AND subject_id = ? AND quarter = ? AND academic_year = ?`,
      [gradeData.student_id, gradeData.subject_id, gradeData.quarter, gradeData.academic_year || "2025-2026"]
    );

    if (existing.length > 0) {
      // Update existing
      return await updateStudentRunningGrade(existing[0].id, gradeData);
    } else {
      // Create new
      return await createStudentRunningGrade(gradeData);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Get student running grades by subject ID and quarter
 */
export async function getStudentRunningGradesBySubjectAndQuarter(subjectId, quarter) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select(
      "SELECT * FROM student_running_grades WHERE subject_id = ? AND quarter = ? AND deleted_at IS NULL",
      [subjectId, quarter]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get student running grades by subject ID and class section
 */
export async function getStudentRunningGradesBySubjectAndClassSection(subjectId, classSectionId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    // Join with students table to filter by class_section_id
    return await db.select(
      `SELECT srg.* FROM student_running_grades srg
       INNER JOIN students s ON srg.student_id = s.id
       WHERE srg.subject_id = ? AND s.class_section_id = ? AND srg.deleted_at IS NULL`,
      [subjectId, classSectionId]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Save or update a student running grade in the local database
 * @deprecated Use createStudentRunningGrade, updateStudentRunningGrade, or upsertStudentRunningGrade instead
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
