import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Clear all sync queue items
 */
export async function clearSyncQueue() {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        await db.execute("DELETE FROM sync_queue");
    } catch (error) {
        throw error;
    }
}

/**
 * Clear all sync log entries
 */
export async function clearSyncLog() {
    try {
        await initDatabaseSchema();
        const db = await getDatabase();
        await db.execute("DELETE FROM sync_log");
    } catch (error) {
        throw error;
    }
}

/**
 * Clear both sync tables
 */
export async function clearAllSyncData() {
    try {
        await clearSyncQueue();
        await clearSyncLog();
    } catch (error) {
        throw error;
    }
}
