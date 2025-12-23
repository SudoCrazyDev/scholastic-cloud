import { getDatabase } from "../client";
import { initDatabaseSchema } from "../schema";

/**
 * Get all users from the local database
 */
export async function getAllUsers() {
  try {
    // Ensure schema is initialized before querying
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT * FROM users");
    return result;
  } catch (error) {
    console.error("Error in getAllUsers:", error);
    throw error;
  }
}

/**
 * Get a user by email
 */
export async function getUserByEmail(email) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT * FROM users WHERE email = ?", [email]);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("Error in getUserByEmail:", error);
    throw error;
  }
}

/**
 * Get a user by ID
 */
export async function getUserById(id) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT * FROM users WHERE id = ?", [id]);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("Error in getUserById:", error);
    throw error;
  }
}

/**
 * Get the current logged-in user (user with a valid token)
 */
export async function getCurrentUser() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select(
      "SELECT * FROM users WHERE token IS NOT NULL AND token != '' ORDER BY updated_at DESC LIMIT 1"
    );
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("Error in getCurrentUser:", error);
    throw error;
  }
}

/**
 * Count total users in the database
 */
export async function getUserCount() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    const result = await db.select("SELECT COUNT(*) as count FROM users");
    return result[0]?.count ?? 0;
  } catch (error) {
    console.error("Error in getUserCount:", error);
    throw error;
  }
}

/**
 * Clear all cached users (used by Debug Database "Clear Cache")
 */
export async function clearUserCache() {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();
    await db.execute("DELETE FROM users");
  } catch (error) {
    console.error("Error in clearUserCache:", error);
    throw error;
  }
}


