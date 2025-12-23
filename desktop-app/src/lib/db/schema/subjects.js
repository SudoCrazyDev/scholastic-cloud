import { getDatabase } from "../client";

/**
 * Initialize the subjects table
 * Mirrors the Laravel Subject model structure
 */
export async function initSubjectTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        class_section_id TEXT NOT NULL,
        adviser TEXT,
        subject_type TEXT NOT NULL DEFAULT 'parent',
        parent_subject_id TEXT,
        title TEXT NOT NULL,
        variant TEXT,
        start_time TEXT,
        end_time TEXT,
        is_limited_student INTEGER DEFAULT 0,
        "order" INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
        FOREIGN KEY (class_section_id) REFERENCES class_sections(id) ON DELETE CASCADE,
        FOREIGN KEY (adviser) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subjects_institution ON subjects(institution_id);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subjects_class_section ON subjects(class_section_id);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subjects_adviser ON subjects(adviser);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_subjects_parent ON subjects(parent_subject_id);
    `);
  } catch (error) {
    throw error;
  }
}

