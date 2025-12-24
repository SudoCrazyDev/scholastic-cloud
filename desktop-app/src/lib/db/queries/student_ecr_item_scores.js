import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update a student ECR item score in the local database
 */
export async function saveStudentEcrItemScore(scoreData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO student_ecr_item_scores (
        id, student_id, subject_ecr_item_id, score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        student_id = excluded.student_id,
        subject_ecr_item_id = excluded.subject_ecr_item_id,
        score = excluded.score,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        scoreData.id,
        scoreData.student_id,
        scoreData.subject_ecr_item_id,
        scoreData.score,
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
