import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update a subject in the local database
 */
export async function saveSubject(subjectData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO subjects (
        id, institution_id, class_section_id, adviser, subject_type, parent_subject_id,
        title, variant, start_time, end_time, is_limited_student, "order", created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        institution_id = excluded.institution_id,
        class_section_id = excluded.class_section_id,
        adviser = excluded.adviser,
        subject_type = excluded.subject_type,
        parent_subject_id = excluded.parent_subject_id,
        title = excluded.title,
        variant = excluded.variant,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        is_limited_student = excluded.is_limited_student,
        "order" = excluded."order",
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        subjectData.id,
        subjectData.institution_id,
        subjectData.class_section_id,
        subjectData.adviser ?? null,
        subjectData.subject_type || 'parent',
        subjectData.parent_subject_id ?? null,
        subjectData.title,
        subjectData.variant ?? null,
        subjectData.start_time ?? null,
        subjectData.end_time ?? null,
        subjectData.is_limited_student ? 1 : 0,
        subjectData.order ?? 0,
        subjectData.created_at ?? null,
        subjectData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get subject by ID
 */
export async function getSubjectById(id) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT * FROM subjects WHERE id = ?", [id]);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    throw error;
  }
}

/**
 * Get all subjects for the current user (where adviser matches user id)
 */
export async function getUserSubjects(userId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM subjects WHERE adviser = ?", [userId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Get all subjects (for debugging)
 */
export async function getAllSubjects() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM subjects");
  } catch (error) {
    throw error;
  }
}

/**
 * Get subjects by class section ID
 */
export async function getSubjectsByClassSection(classSectionId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM subjects WHERE class_section_id = ?", [classSectionId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached subjects (used by Debug Database "Clear Data")
 */
export async function clearSubjectCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM subjects");
  } catch (error) {
    throw error;
  }
}

