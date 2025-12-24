import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update a subject ECR in the local database
 */
export async function saveSubjectEcr(subjectEcrData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO subjects_ecr (
        id, subject_id, title, percentage, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subject_id = excluded.subject_id,
        title = excluded.title,
        percentage = excluded.percentage,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        subjectEcrData.id,
        subjectEcrData.subject_id,
        subjectEcrData.title,
        subjectEcrData.percentage,
        subjectEcrData.created_at ?? null,
        subjectEcrData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get all subject ECRs (for debugging)
 */
export async function getAllSubjectEcrs() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM subjects_ecr");
  } catch (error) {
    throw error;
  }
}

/**
 * Get subject ECRs by subject ID
 */
export async function getSubjectEcrsBySubjectId(subjectId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM subjects_ecr WHERE subject_id = ?", [subjectId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached subject ECRs (used by Debug Database "Clear Data")
 */
export async function clearSubjectEcrCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM subjects_ecr");
  } catch (error) {
    throw error;
  }
}

