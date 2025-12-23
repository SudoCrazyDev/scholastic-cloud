import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

// Singleton database promise
let dbPromise = null;

/**
 * Check if we're running in Tauri context
 * In Tauri v2, we check by trying to use the imported API
 */
async function isTauriContext() {
  try {
    // Try to use invoke - if it works, we're in Tauri
    if (typeof invoke !== "undefined") {
      // Quick test to verify Tauri is available
      await invoke("greet", { name: "test" });
      return true;
    }
    return false;
  } catch (error) {
    // If invoke fails, we're not in Tauri context
    return false;
  }
}

/**
 * Get (and lazily create) the SQLite database connection.
 *
 * The database file will be created automatically when the first query is executed.
 * Tauri stores SQLite databases in the app's data directory.
 *
 * If we ever need multiple DB files (e.g. per-tenant), this
 * function is the only place we'll need to touch.
 */
export async function getDatabase() {
  // Check if we're in Tauri context
  const tauriAvailable = await isTauriContext();
  
  if (!tauriAvailable) {
    throw new Error(
      "Tauri API is not available. Make sure you're running the app with 'npm run desktop' (not 'npm run dev'). " +
      "The SQLite database only works in the Tauri desktop app context."
    );
  }

  if (!dbPromise) {
    // The file will be created automatically when first query runs
    dbPromise = Database.load("sqlite:scholastic_cloud.db");
    // Test the connection by running a simple query
    const db = await dbPromise;
    await db.select("SELECT 1 as test");
  }
  return dbPromise;
}


