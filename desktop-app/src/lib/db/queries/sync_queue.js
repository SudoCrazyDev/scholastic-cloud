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
 * Add item to sync queue
 */
export async function addToSyncQueue(tableName, recordId, operation, data) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();

        // Check if item already exists in queue
        const existing = await db.select(
            "SELECT * FROM sync_queue WHERE table_name = ? AND record_id = ? AND status = 'pending'",
            [tableName, recordId]
        );

        const now = new Date().toISOString();

        if (existing.length > 0) {
            // Update existing queue item
            await db.execute(
                `UPDATE sync_queue 
         SET operation = ?, data = ?, updated_at = ?
         WHERE id = ?`,
                [operation, JSON.stringify(data), now, existing[0].id]
            );
            return existing[0].id;
        } else {
            // Create new queue item
            const id = generateUUID();
            await db.execute(
                `INSERT INTO sync_queue (
          id, table_name, record_id, operation, data, status, retry_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
                [id, tableName, recordId, operation, JSON.stringify(data), now, now]
            );
            return id;
        }
    } catch (error) {
        throw error;
    }
}

/**
 * Get pending sync items for a table
 */
export async function getPendingSyncItems(tableName) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        const items = await db.select(
            "SELECT * FROM sync_queue WHERE table_name = ? AND status = 'pending' ORDER BY created_at ASC",
            [tableName]
        );

        // Parse JSON data
        return items.map(item => ({
            ...item,
            data: JSON.parse(item.data)
        }));
    } catch (error) {
        throw error;
    }
}

/**
 * Get count of pending items
 */
export async function getPendingCount(tableName) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        const result = await db.select(
            "SELECT COUNT(*) as count FROM sync_queue WHERE table_name = ? AND status = 'pending'",
            [tableName]
        );
        return result[0]?.count || 0;
    } catch (error) {
        throw error;
    }
}

/**
 * Mark item as syncing
 */
export async function markAsSyncing(id) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        await db.execute(
            "UPDATE sync_queue SET status = 'syncing', updated_at = ? WHERE id = ?",
            [new Date().toISOString(), id]
        );
    } catch (error) {
        throw error;
    }
}

/**
 * Mark item as synced and remove from queue
 */
export async function markAsSynced(id) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        await db.execute("DELETE FROM sync_queue WHERE id = ?", [id]);
    } catch (error) {
        throw error;
    }
}

/**
 * Mark item as failed
 */
export async function markAsFailed(id, errorMessage) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        await db.execute(
            `UPDATE sync_queue 
       SET status = 'failed', error_message = ?, updated_at = ?
       WHERE id = ?`,
            [errorMessage, new Date().toISOString(), id]
        );
    } catch (error) {
        throw error;
    }
}

/**
 * Increment retry count
 */
export async function incrementRetryCount(id) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        await db.execute(
            "UPDATE sync_queue SET retry_count = retry_count + 1, updated_at = ? WHERE id = ?",
            [new Date().toISOString(), id]
        );
    } catch (error) {
        throw error;
    }
}

/**
 * Clear synced items (cleanup)
 */
export async function clearSyncedItems() {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        await db.execute("DELETE FROM sync_queue WHERE status = 'synced'");
    } catch (error) {
        throw error;
    }
}

/**
 * Get failed items
 */
export async function getFailedItems(tableName) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        const items = await db.select(
            "SELECT * FROM sync_queue WHERE table_name = ? AND status = 'failed' ORDER BY created_at ASC",
            [tableName]
        );

        // Parse JSON data
        return items.map(item => ({
            ...item,
            data: JSON.parse(item.data)
        }));
    } catch (error) {
        throw error;
    }
}

/**
 * Reset failed item to pending (for retry)
 */
export async function resetFailedItem(id) {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        await db.execute(
            "UPDATE sync_queue SET status = 'pending', error_message = NULL, updated_at = ? WHERE id = ?",
            [new Date().toISOString(), id]
        );
    } catch (error) {
        throw error;
    }
}
