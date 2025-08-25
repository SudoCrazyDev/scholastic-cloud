import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { createTables, dropAllTables } from './schema';
import CryptoJS from 'crypto-js';

class DatabaseManager {
  private db: Database.Database | null = null;
  private encryptionKey: string = '';

  constructor() {
    this.initDatabase();
  }

  private initDatabase() {
    try {
      // Ensure the app data directory exists
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'scholastic.db');

      // Create database directory if it doesn't exist
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Initialize the database
      this.db = new Database(dbPath);
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      // Set journal mode for better performance
      this.db.pragma('journal_mode = WAL');
      
      // Create tables
      this.db.exec(createTables);
      
      // Generate or retrieve encryption key
      this.initEncryptionKey();
      
      console.log('Database initialized successfully at:', dbPath);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private initEncryptionKey() {
    try {
      const stmt = this.db!.prepare('SELECT value FROM app_settings WHERE key = ?');
      const result = stmt.get('encryption_key') as { value: string } | undefined;
      
      if (result) {
        this.encryptionKey = result.value;
      } else {
        // Generate a new encryption key
        this.encryptionKey = CryptoJS.lib.WordArray.random(256/8).toString();
        const insertStmt = this.db!.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)');
        insertStmt.run('encryption_key', this.encryptionKey);
      }
    } catch (error) {
      console.error('Failed to initialize encryption key:', error);
      throw error;
    }
  }

  // Encrypt sensitive data
  encrypt(text: string): string {
    return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
  }

  // Decrypt sensitive data
  decrypt(ciphertext: string): string {
    const bytes = CryptoJS.AES.decrypt(ciphertext, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Get database instance
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  // User authentication methods
  async authenticateUser(email: string, password: string): Promise<any> {
    try {
      const stmt = this.db!.prepare('SELECT * FROM users WHERE email = ?');
      const user = stmt.get(email);
      
      if (!user) {
        return null;
      }

      // Verify password (comparing with encrypted password)
      const decryptedPassword = this.decrypt((user as any).password_hash);
      if (decryptedPassword !== password) {
        return null;
      }

      // Update last login
      const updateStmt = this.db!.prepare('UPDATE users SET last_login = ? WHERE id = ?');
      updateStmt.run(new Date().toISOString(), (user as any).id);

      return user;
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  // Save user credentials for offline login
  async saveUserCredentials(user: any, password: string, token: string) {
    const transaction = this.db!.transaction(() => {
      // Save or update user
      const userStmt = this.db!.prepare(`
        INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, institution_id, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      userStmt.run(
        user.id,
        user.email,
        this.encrypt(password), // Store encrypted password
        user.first_name || '',
        user.last_name || '',
        user.role || 'teacher',
        user.institution_id || '',
        new Date().toISOString()
      );

      // Save auth token
      const tokenStmt = this.db!.prepare(`
        INSERT INTO auth_tokens (user_id, token, expires_at)
        VALUES (?, ?, ?)
      `);
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Token expires in 7 days
      
      tokenStmt.run(user.id, token, expiresAt.toISOString());
    });

    transaction();
  }

  // Get all unsynced records
  async getUnsyncedRecords(): Promise<any[]> {
    try {
      const stmt = this.db!.prepare('SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC');
      return stmt.all();
    } catch (error) {
      console.error('Failed to get unsynced records:', error);
      throw error;
    }
  }

  // Mark records as synced
  async markRecordsAsSynced(ids: number[]) {
    const transaction = this.db!.transaction(() => {
      const stmt = this.db!.prepare('UPDATE sync_queue SET synced = 1, synced_at = ? WHERE id = ?');
      const now = new Date().toISOString();
      
      for (const id of ids) {
        stmt.run(now, id);
      }
    });

    transaction();
  }

  // Add record to sync queue
  async addToSyncQueue(tableName: string, operation: string, recordId: string, data: any) {
    try {
      const stmt = this.db!.prepare(`
        INSERT INTO sync_queue (table_name, operation, record_id, data)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run(tableName, operation, recordId, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to add to sync queue:', error);
      throw error;
    }
  }

  // Clear all data (for logout or reset)
  async clearAllData() {
    try {
      this.db!.exec(dropAllTables);
      this.db!.exec(createTables);
      this.initEncryptionKey();
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw error;
    }
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Get sync statistics
  async getSyncStatistics() {
    try {
      const unsyncedStmt = this.db!.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0');
      const unsynced = unsyncedStmt.get() as { count: number };
      
      const lastSyncStmt = this.db!.prepare('SELECT * FROM sync_history ORDER BY completed_at DESC LIMIT 1');
      const lastSync = lastSyncStmt.get();
      
      return {
        unsyncedCount: unsynced.count,
        lastSync: lastSync || null
      };
    } catch (error) {
      console.error('Failed to get sync statistics:', error);
      throw error;
    }
  }
}

// Create singleton instance
let dbManager: DatabaseManager | null = null;

export function getDatabase(): DatabaseManager {
  if (!dbManager) {
    dbManager = new DatabaseManager();
  }
  return dbManager;
}

export default DatabaseManager;