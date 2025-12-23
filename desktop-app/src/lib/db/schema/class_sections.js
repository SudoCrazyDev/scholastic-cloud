import { getDatabase } from "../client";

/**
 * Initialize the class_sections table
 * Mirrors the Laravel ClassSection model structure
 */
export async function initClassSectionTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS class_sections (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        grade_level TEXT NOT NULL,
        title TEXT NOT NULL,
        adviser TEXT,
        academic_year TEXT,
        status TEXT,
        deleted_at TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
        FOREIGN KEY (adviser) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_class_sections_institution ON class_sections(institution_id);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_class_sections_adviser ON class_sections(adviser);
    `);
  } catch (error) {
    throw error;
  }
}

