import { getDatabase } from "../client";

/**
 * Initialize the subjects_ecr table
 * Mirrors the Laravel SubjectEcr model structure
 */
export async function initSubjectEcrTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS subjects_ecr (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        title TEXT NOT NULL,
        percentage TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subjects_ecr_subject ON subjects_ecr(subject_id);
    `);
  } catch (error) {
    throw error;
  }
}

