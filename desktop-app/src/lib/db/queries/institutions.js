import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Save or update an institution in the local database
 */
export async function saveInstitution(institutionData) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    
    await db.execute(
      `
      INSERT INTO institutions (
        id,
        title,
        abbr,
        division,
        region,
        gov_id,
        logo,
        subscription_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        abbr = excluded.abbr,
        division = excluded.division,
        region = excluded.region,
        gov_id = excluded.gov_id,
        logo = excluded.logo,
        subscription_id = excluded.subscription_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        institutionData.id,
        institutionData.title,
        institutionData.abbr ?? null,
        institutionData.division ?? null,
        institutionData.region ?? null,
        institutionData.gov_id ?? null,
        institutionData.logo ?? null,
        institutionData.subscription_id ?? null,
        institutionData.created_at ?? null,
        institutionData.updated_at ?? null,
      ]
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get institution by ID
 */
export async function getInstitutionById(id) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT * FROM institutions WHERE id = ?", [id]);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    throw error;
  }
}

/**
 * Get the current user's institution
 * Since we only download the current user's default institution,
 * we return the first (and should be only) institution in the database
 */
export async function getCurrentInstitution() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT * FROM institutions ORDER BY updated_at DESC LIMIT 1");
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    throw error;
  }
}

/**
 * Get all institutions (for debugging)
 */
export async function getAllInstitutions() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    return await db.select("SELECT * FROM institutions");
  } catch (error) {
    throw error;
  }
}

/**
 * Clear all cached institutions (used by Debug Database "Clear Data")
 */
export async function clearInstitutionCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM institutions");
  } catch (error) {
    throw error;
  }
}

