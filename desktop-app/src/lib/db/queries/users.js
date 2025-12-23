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
 * Save or update a user in the local database
 * Used for saving the current user and also adviser users from class sections
 */
export async function saveUser(userData, token = null, tokenExpiry = null) {
  try {
    await initDatabaseSchema();
    const db = await getDatabase();

    await db.execute(
      `
      INSERT INTO users (
        id, first_name, middle_name, last_name, ext_name, gender, birthdate,
        email, email_verified_at, password, token, token_expiry, is_new, role_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        first_name = excluded.first_name,
        middle_name = excluded.middle_name,
        last_name = excluded.last_name,
        ext_name = excluded.ext_name,
        gender = excluded.gender,
        birthdate = excluded.birthdate,
        email = excluded.email,
        email_verified_at = excluded.email_verified_at,
        token = COALESCE(excluded.token, users.token),
        token_expiry = COALESCE(excluded.token_expiry, users.token_expiry),
        is_new = excluded.is_new,
        role_id = excluded.role_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
      `,
      [
        userData.id,
        userData.first_name,
        userData.middle_name ?? null,
        userData.last_name ?? null,
        userData.ext_name ?? null,
        userData.gender ?? null,
        userData.birthdate ?? null,
        userData.email,
        userData.email_verified_at ?? null,
        null, // password is never returned from API
        token ?? null,
        tokenExpiry ?? null,
        userData.is_new ? 1 : 0,
        userData.role_id ?? null,
        userData.created_at ?? null,
        userData.updated_at ?? null,
      ]
    );
  } catch (error) {
    console.error("Error in saveUser:", error);
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


