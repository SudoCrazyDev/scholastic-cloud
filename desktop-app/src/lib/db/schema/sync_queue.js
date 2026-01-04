import { getDatabase } from "../client";

/**
 * Initialize the sync_queue table
 */
export async function initSyncQueueTable() {
    const db = await getDatabase();

    await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      data TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

    // Create index for faster queries
    await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status 
    ON sync_queue(status)
  `);

    await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_table_name 
    ON sync_queue(table_name)
  `);
}
