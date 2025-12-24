import { getDatabase } from "../client";

/**
 * Initialize the student_ecr_item_scores table
 * Mirrors the Laravel StudentEcrItemScore model structure
 */
export async function initStudentEcrItemScoreTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS student_ecr_item_scores (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        subject_ecr_item_id TEXT NOT NULL,
        score TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_ecr_item_id) REFERENCES subject_ecr_items(id) ON DELETE CASCADE
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_student_ecr_scores_student ON student_ecr_item_scores(student_id);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_student_ecr_scores_item ON student_ecr_item_scores(subject_ecr_item_id);
    `);
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_student_ecr_scores_unique ON student_ecr_item_scores(student_id, subject_ecr_item_id);
    `);
  } catch (error) {
    throw error;
  }
}

