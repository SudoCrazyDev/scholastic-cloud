import { getDatabase } from "../client";

/**
 * Initialize the student_sections table
 * Mirrors the Laravel StudentSection model structure
 */
export async function initStudentSectionTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS student_sections (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        academic_year TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        is_promoted INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (section_id) REFERENCES class_sections(id) ON DELETE CASCADE
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_student_sections_student ON student_sections(student_id);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_student_sections_section ON student_sections(section_id);
    `);
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_student_sections_unique ON student_sections(student_id, section_id, academic_year);
    `);
  } catch (error) {
    throw error;
  }
}

