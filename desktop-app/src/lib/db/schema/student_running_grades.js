import { getDatabase } from "../client";

/**
 * Initialize the student_running_grades table
 * Mirrors the Laravel StudentRunningGrade model structure
 */
export async function initStudentRunningGradeTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS student_running_grades (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        quarter TEXT NOT NULL,
        grade TEXT NOT NULL,
        final_grade TEXT,
        academic_year TEXT NOT NULL,
        note TEXT,
        deleted_at TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_student_running_grades_student ON student_running_grades(student_id);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_student_running_grades_subject ON student_running_grades(subject_id);
    `);
  } catch (error) {
    throw error;
  }
}

