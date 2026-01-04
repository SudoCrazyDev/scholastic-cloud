import { getDatabase } from "../client";

/**
 * Initialize the sync_log table
 */
export async function initSyncLogTable() {
    const db = await getDatabase();

    await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      sync_type TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      items_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT
    )
  `);

    // Create index for faster queries
    await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_log_sync_type 
    ON sync_log(sync_type)
  `);

    await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_log_direction 
    ON sync_log(direction)
  `);
}
