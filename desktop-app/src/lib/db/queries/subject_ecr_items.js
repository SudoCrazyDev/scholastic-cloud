import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update a subject ECR item in the local database
 */
export async function saveSubjectEcrItem(subjectEcrItemData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO subject_ecr_items (
        id, subject_ecr_id, type, title, description, quarter, academic_year, score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subject_ecr_id = excluded.subject_ecr_id,
        type = excluded.type,
        title = excluded.title,
        description = excluded.description,
        quarter = excluded.quarter,
        academic_year = excluded.academic_year,
        score = excluded.score,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        subjectEcrItemData.id,
        subjectEcrItemData.subject_ecr_id,
        subjectEcrItemData.type ?? null,
        subjectEcrItemData.title,
        subjectEcrItemData.description ?? null,
        subjectEcrItemData.quarter ?? null,
        subjectEcrItemData.academic_year ?? null,
        subjectEcrItemData.score ?? null,
        subjectEcrItemData.created_at ?? null,
        subjectEcrItemData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get all subject ECR items (for debugging)
 */
export async function getAllSubjectEcrItems() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM subject_ecr_items");
  } catch (error) {
    throw error;
  }
}

/**
 * Get subject ECR items by subject ECR ID
 */
export async function getSubjectEcrItemsBySubjectEcrId(subjectEcrId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM subject_ecr_items WHERE subject_ecr_id = ?", [subjectEcrId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached subject ECR items (used by Debug Database "Clear Data")
 */
export async function clearSubjectEcrItemCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM subject_ecr_items");
  } catch (error) {
    throw error;
  }
}

