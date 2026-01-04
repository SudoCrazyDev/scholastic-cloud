import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Generate a UUID v4
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Create new sync log entry
 */
export async function createSyncLog(syncType, direction) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();

        const id = generateUUID();
        const now = new Date().toISOString();

        await db.execute(
            `INSERT INTO sync_log (
        id, sync_type, direction, status, items_count, success_count, failed_count, started_at
      ) VALUES (?, ?, ?, 'in_progress', 0, 0, 0, ?)`,
            [id, syncType, direction, now]
        );

        return id;
    } catch (error) {
        throw error;
    }
}

/**
 * Update sync log
 */
export async function updateSyncLog(id, updates) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();

        const fields = [];
        const values = [];

        if (updates.items_count !== undefined) {
            fields.push("items_count = ?");
            values.push(updates.items_count);
        }
        if (updates.success_count !== undefined) {
            fields.push("success_count = ?");
            values.push(updates.success_count);
        }
        if (updates.failed_count !== undefined) {
            fields.push("failed_count = ?");
            values.push(updates.failed_count);
        }
        if (updates.status) {
            fields.push("status = ?");
            values.push(updates.status);
        }

        if (fields.length > 0) {
            values.push(id);
            await db.execute(
                `UPDATE sync_log SET ${fields.join(", ")} WHERE id = ?`,
                values
            );
        }
    } catch (error) {
        throw error;
    }
}

/**
 * Complete sync log
 */
export async function completeSyncLog(id, successCount, failedCount) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();

        await db.execute(
            `UPDATE sync_log 
       SET status = 'completed', success_count = ?, failed_count = ?, completed_at = ?
       WHERE id = ?`,
            [successCount, failedCount, new Date().toISOString(), id]
        );
    } catch (error) {
        throw error;
    }
}

/**
 * Mark sync log as failed
 */
export async function failSyncLog(id, errorMessage) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();

        await db.execute(
            `UPDATE sync_log 
       SET status = 'failed', error_message = ?, completed_at = ?
       WHERE id = ?`,
            [errorMessage, new Date().toISOString(), id]
        );
    } catch (error) {
        throw error;
    }
}

/**
 * Get last sync log for a type and direction
 */
export async function getLastSyncLog(syncType, direction) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();

        const result = await db.select(
            `SELECT * FROM sync_log 
       WHERE sync_type = ? AND direction = ? AND status = 'completed'
       ORDER BY completed_at DESC 
       LIMIT 1`,
            [syncType, direction]
        );

        return result[0] || null;
    } catch (error) {
        throw error;
    }
}

/**
 * Get all sync logs (limited)
 */
export async function getAllSyncLogs(limit = 50) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();

        return await db.select(
            `SELECT * FROM sync_log 
       ORDER BY started_at DESC 
       LIMIT ?`,
            [limit]
        );
    } catch (error) {
        throw error;
    }
}

/**
 * Clear old sync logs (keep last N)
 */
export async function clearOldSyncLogs(keepCount = 100) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();

        await db.execute(
            `DELETE FROM sync_log 
       WHERE id NOT IN (
         SELECT id FROM sync_log 
         ORDER BY started_at DESC 
         LIMIT ?
       )`,
            [keepCount]
        );
    } catch (error) {
        throw error;
    }
}
