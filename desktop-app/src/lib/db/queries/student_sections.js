import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update a student section in the local database
 */
export async function saveStudentSection(studentSectionData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO student_sections (
        id, student_id, section_id, academic_year, is_active, is_promoted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        student_id = excluded.student_id,
        section_id = excluded.section_id,
        academic_year = excluded.academic_year,
        is_active = excluded.is_active,
        is_promoted = excluded.is_promoted,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        studentSectionData.id,
        studentSectionData.student_id,
        studentSectionData.section_id,
        studentSectionData.academic_year,
        studentSectionData.is_active ? 1 : 0,
        studentSectionData.is_promoted ? 1 : 0,
        studentSectionData.created_at ?? null,
        studentSectionData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get all student sections (for debugging)
 */
export async function getAllStudentSections() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM student_sections");
  } catch (error) {
    throw error;
  }
}

/**
 * Get student sections by class section ID
 */
export async function getStudentSectionsByClassSection(classSectionId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM student_sections WHERE section_id = ?", [classSectionId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached student sections (used by Debug Database "Clear Data")
 */
export async function clearStudentSectionCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM student_sections");
  } catch (error) {
    throw error;
  }
}

