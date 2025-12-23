import { getDatabase } from "./client";

/**
 * Get database file information
 * Note: Tauri stores SQLite databases in the app's data directory
 * 
 * On Windows: %APPDATA%\scholastic-cloud-desktop\data\scholastic_cloud.db
 * On macOS: ~/Library/Application Support/scholastic-cloud-desktop/data/scholastic_cloud.db
 * On Linux: ~/.local/share/scholastic-cloud-desktop/data/scholastic_cloud.db
 */
export function getDatabasePath() {
  // Tauri SQL plugin stores databases in the app's data directory
  // The exact path depends on the OS, but it's typically:
  const os = navigator.platform.toLowerCase();
  
  if (os.includes("win")) {
    return "%APPDATA%\\scholastic-cloud-desktop\\data\\scholastic_cloud.db";
  } else if (os.includes("mac")) {
    return "~/Library/Application Support/scholastic-cloud-desktop/data/scholastic_cloud.db";
  } else {
    return "~/.local/share/scholastic-cloud-desktop/data/scholastic_cloud.db";
  }
}

/**
 * Check if the users table exists
 */
export async function checkTableExists(tableName = "users") {
  try {
    const db = await getDatabase();
    const result = await db.select(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName]
    );
    return result.length > 0;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

/**
 * Get all table names in the database
 */
export async function getAllTables() {
  try {
    const db = await getDatabase();
    const result = await db.select(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
    return result.map((row) => row.name);
  } catch (error) {
    console.error("Error getting all tables:", error);
    return [];
  }
}

