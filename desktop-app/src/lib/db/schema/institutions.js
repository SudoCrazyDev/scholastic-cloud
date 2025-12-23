import { getDatabase } from "../client";

/**
 * Initialize the institutions table
 * Mirrors the Laravel Institution model structure
 */
export async function initInstitutionTable() {
  try {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS institutions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        abbr TEXT,
        division TEXT,
        region TEXT,
        gov_id TEXT,
        logo TEXT,
        subscription_id TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_institutions_subscription ON institutions(subscription_id);
    `);
  } catch (error) {
    throw error;
  }
}

