import { getDatabase } from "../client";

/**
 * Initialize the students table
 * Mirrors the Laravel Student model structure
 */
export async function initStudentTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        lrn TEXT,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT,
        ext_name TEXT,
        gender TEXT NOT NULL,
        birthdate TEXT,
        profile_picture TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_students_lrn ON students(lrn);
    `);
  } catch (error) {
    throw error;
  }
}

