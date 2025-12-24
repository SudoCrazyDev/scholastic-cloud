import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update a student in the local database
 */
export async function saveStudent(studentData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO students (
        id, lrn, first_name, middle_name, last_name, ext_name, gender, birthdate,
        profile_picture, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        lrn = excluded.lrn,
        first_name = excluded.first_name,
        middle_name = excluded.middle_name,
        last_name = excluded.last_name,
        ext_name = excluded.ext_name,
        gender = excluded.gender,
        birthdate = excluded.birthdate,
        profile_picture = excluded.profile_picture,
        is_active = excluded.is_active,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        studentData.id,
        studentData.lrn ?? null,
        studentData.first_name,
        studentData.middle_name ?? null,
        studentData.last_name ?? null,
        studentData.ext_name ?? null,
        studentData.gender,
        studentData.birthdate ?? null,
        studentData.profile_picture ?? null,
        studentData.is_active ? 1 : 0,
        studentData.created_at ?? null,
        studentData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get student by ID
 */
export async function getStudentById(id) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT * FROM students WHERE id = ?", [id]);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    throw error;
  }
}

/**
 * Get all students (for debugging)
 */
export async function getAllStudents() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM students");
  } catch (error) {
    throw error;
  }
}

/**
 * Get students by class section ID
 */
export async function getStudentsByClassSection(classSectionId) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select(
      `SELECT s.* FROM students s
       INNER JOIN student_sections ss ON s.id = ss.student_id
       WHERE ss.section_id = ? AND ss.is_active = 1`,
      [classSectionId]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached students (used by Debug Database "Clear Data")
 */
export async function clearStudentCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM students");
  } catch (error) {
    throw error;
  }
}

