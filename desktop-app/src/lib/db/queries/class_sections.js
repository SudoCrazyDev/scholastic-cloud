import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update a class section in the local database
 */
export async function saveClassSection(classSectionData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO class_sections (
        id, institution_id, grade_level, title, adviser, academic_year, status, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        institution_id = excluded.institution_id,
        grade_level = excluded.grade_level,
        title = excluded.title,
        adviser = excluded.adviser,
        academic_year = excluded.academic_year,
        status = excluded.status,
        deleted_at = excluded.deleted_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        classSectionData.id,
        classSectionData.institution_id,
        classSectionData.grade_level,
        classSectionData.title,
        classSectionData.adviser ?? null,
        classSectionData.academic_year ?? null,
        classSectionData.status ?? null,
        classSectionData.deleted_at ?? null,
        classSectionData.created_at ?? null,
        classSectionData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get class section by ID
 */
export async function getClassSectionById(id) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT * FROM class_sections WHERE id = ?", [id]);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    throw error;
  }
}

/**
 * Get all class sections for the current user (where adviser matches user id)
 */
export async function getUserClassSections(userId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM class_sections WHERE adviser = ?", [userId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Get all class sections (for debugging)
 */
export async function getAllClassSections() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM class_sections");
  } catch (error) {
    throw error;
  }
}

/**
 * Get class sections by institution ID
 */
export async function getClassSectionsByInstitution(institutionId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM class_sections WHERE institution_id = ?", [institutionId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached class sections (used by Debug Database "Clear Data")
 */
export async function clearClassSectionCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM class_sections");
  } catch (error) {
    throw error;
  }
}

