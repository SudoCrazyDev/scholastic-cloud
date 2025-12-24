import { getDatabase } from "../client";

/**
 * Initialize the subject_ecr_items table
 * Mirrors the Laravel SubjectEcrItem model structure
 */
export async function initSubjectEcrItemTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS subject_ecr_items (
        id TEXT PRIMARY KEY,
        subject_ecr_id TEXT NOT NULL,
        type TEXT,
        title TEXT NOT NULL,
        description TEXT,
        quarter TEXT,
        academic_year TEXT,
        score TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (subject_ecr_id) REFERENCES subjects_ecr(id) ON DELETE CASCADE
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subject_ecr_items_ecr ON subject_ecr_items(subject_ecr_id);
    `);
  } catch (error) {
    throw error;
  }
}

