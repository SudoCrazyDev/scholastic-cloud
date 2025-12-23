import { getDatabase } from "../client";

/**
 * Create the `users` table if it does not exist.
 *
 * Mirrors `api/database/migrations/0001_01_01_000000_create_users_table.php`
 * with SQLite-friendly types.
 */
export async function initUserTable() {
  const db = await getDatabase();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,                    -- Laravel uuid
      first_name TEXT NOT NULL,
      middle_name TEXT,
      last_name TEXT,
      ext_name TEXT,
      gender TEXT,
      birthdate TEXT,                         -- stored as ISO date string
      email TEXT NOT NULL UNIQUE,
      email_verified_at TEXT,                 -- nullable datetime
      password TEXT,                          -- hashed password from API (if ever needed)
      token TEXT,
      token_expiry TEXT,
      is_new INTEGER DEFAULT 1,               -- boolean (0/1)
      role_id INTEGER,                        -- foreign key to roles (stored as integer id)
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
}


