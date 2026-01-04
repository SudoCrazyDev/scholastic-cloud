import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

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
 * Create a new subject ECR component
 */
export async function createSubjectEcr(ecrData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    const id = generateUUID();
    const now = new Date().toISOString();

    await db.execute(
      `
      INSERT INTO subjects_ecr (
        id, subject_id, title, percentage, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        ecrData.subject_id,
        ecrData.title,
        ecrData.percentage,
        now,
        now,
      ]
    );

    return {
      id,
      subject_id: ecrData.subject_id,
      title: ecrData.title,
      percentage: ecrData.percentage,
      created_at: now,
      updated_at: now,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Update an existing subject ECR component
 */
export async function updateSubjectEcr(id, ecrData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    const now = new Date().toISOString();

    await db.execute(
      `
      UPDATE subjects_ecr
      SET title = ?, percentage = ?, updated_at = ?
      WHERE id = ?
      `,
      [ecrData.title, ecrData.percentage, now, id]
    );

    // Fetch and return the updated ECR
    const result = await db.select(
      "SELECT * FROM subjects_ecr WHERE id = ?",
      [id]
    );

    if (result.length === 0) {
      throw new Error("Subject ECR not found after update");
    }

    return result[0];
  } catch (error) {
    throw error;
  }
}

/**
 * Delete a subject ECR component
 */
export async function deleteSubjectEcr(id) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      "DELETE FROM subjects_ecr WHERE id = ?",
      [id]
    );

    return { success: true };
  } catch (error) {
    throw error;
  }
}

/**
 * Delete all subject ECR components for a subject
 */
export async function deleteSubjectEcrsBySubjectId(subjectId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      "DELETE FROM subjects_ecr WHERE subject_id = ?",
      [subjectId]
    );

    return { success: true };
  } catch (error) {
    throw error;
  }
}

/**
 * Save or update a subject ECR in the local database
 * @deprecated Use createSubjectEcr or updateSubjectEcr instead
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
