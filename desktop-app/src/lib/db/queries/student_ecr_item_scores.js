import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create a new student ECR item score in the local database
 */
export async function createStudentEcrItemScore(scoreData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    const id = generateUUID();
    const now = new Date().toISOString();
    const academicYear = scoreData.academic_year || "2025-2026";

    await db.execute(
      `
      INSERT INTO student_ecr_item_scores (
        id, student_id, subject_ecr_item_id, score, academic_year, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        scoreData.student_id,
        scoreData.subject_ecr_item_id,
        scoreData.score,
        academicYear,
        now,
        now,
      ]
    );

    return {
      id,
      student_id: scoreData.student_id,
      subject_ecr_item_id: scoreData.subject_ecr_item_id,
      score: scoreData.score,
      academic_year: academicYear,
      created_at: now,
      updated_at: now,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Update an existing student ECR item score
 */
export async function updateStudentEcrItemScore(id, scoreData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    const now = new Date().toISOString();

    await db.execute(
      `
      UPDATE student_ecr_item_scores
      SET score = ?, updated_at = ?
      WHERE id = ?
      `,
      [scoreData.score, now, id]
    );

    // Fetch and return the updated score
    const result = await db.select(
      "SELECT * FROM student_ecr_item_scores WHERE id = ?",
      [id]
    );

    if (result.length === 0) {
      throw new Error("Score not found after update");
    }

    return result[0];
  } catch (error) {
    throw error;
  }
}

/**
 * Delete a student ECR item score
 */
export async function deleteStudentEcrItemScore(id) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      "DELETE FROM student_ecr_item_scores WHERE id = ?",
      [id]
    );

    return { success: true };
  } catch (error) {
    throw error;
  }
}

/**
 * Get a single student ECR item score by student_id and subject_ecr_item_id
 */
export async function getStudentEcrItemScore(studentId, subjectEcrItemId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    const result = await db.select(
      `SELECT * FROM student_ecr_item_scores 
       WHERE student_id = ? AND subject_ecr_item_id = ?
       LIMIT 1`,
      [studentId, subjectEcrItemId]
    );

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    throw error;
  }
}

/**
 * Save or update a student ECR item score in the local database
 * @deprecated Use createStudentEcrItemScore or updateStudentEcrItemScore instead
 */
export async function saveStudentEcrItemScore(scoreData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    const academicYear = scoreData.academic_year || "2025-2026";

    await db.execute(
      `
      INSERT INTO student_ecr_item_scores (
        id, student_id, subject_ecr_item_id, score, academic_year, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        student_id = excluded.student_id,
        subject_ecr_item_id = excluded.subject_ecr_item_id,
        score = excluded.score,
        academic_year = excluded.academic_year,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        scoreData.id,
        scoreData.student_id,
        scoreData.subject_ecr_item_id,
        scoreData.score,
        academicYear,
        scoreData.created_at ?? null,
        scoreData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get all student ECR item scores (for debugging)
 */
export async function getAllStudentEcrItemScores() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM student_ecr_item_scores");
  } catch (error) {
    throw error;
  }
}

/**
 * Get student ECR item scores by student ID
 */
export async function getStudentEcrItemScoresByStudentId(studentId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM student_ecr_item_scores WHERE student_id = ?", [studentId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Get student ECR item scores by subject ECR item ID
 */
export async function getStudentEcrItemScoresByItemId(subjectEcrItemId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM student_ecr_item_scores WHERE subject_ecr_item_id = ?", [subjectEcrItemId]);
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached student ECR item scores (used by Debug Database "Clear Data")
 */
export async function clearStudentEcrItemScoreCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM student_ecr_item_scores");
  } catch (error) {
    throw error;
  }
}
