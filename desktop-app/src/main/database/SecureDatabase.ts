import Database from 'better-sqlite3'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface DatabaseConfig {
  encryptionKey: string
  databasePath: string
  maxRetries: number
  timeout: number
}

export interface User {
  id: string
  firstName: string
  middleName?: string
  lastName?: string
  extName?: string
  gender?: string
  birthdate?: string
  email: string
  emailVerifiedAt?: string
  token?: string
  tokenExpiry?: string
  isNew: boolean
  roleId?: number
  roleTitle?: string
  roleSlug?: string
  isActive: boolean
  lastLogin?: string
  createdAt: string
  updatedAt: string
}

export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: string
  createdAt: string
}

export class SecureDatabase {
  private db: Database.Database | null = null
  private config: DatabaseConfig
  private isInitialized = false
  // encryptionKey retained in config; no instance property needed

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      encryptionKey: config.encryptionKey || this.generateEncryptionKey(),
      databasePath: config.databasePath || this.getDefaultDatabasePath(),
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 5000
    }
    // Buffer.from(this.config.encryptionKey, 'hex') // reserved for future crypto-at-rest
  }

  private generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  private getDefaultDatabasePath(): string {
    const userDataPath = app.getPath('userData')
    const dbDir = path.join(userDataPath, 'database')
    
    // Ensure database directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    
    return path.join(dbDir, 'scholastic.db')
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Create database directory if it doesn't exist
      const dbDir = path.dirname(this.config.databasePath)
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
      }

      // For development, always start with a fresh database
      // Delete database file and any associated WAL/SHM files
      const dbPath = this.config.databasePath
      const dbName = path.basename(dbPath, '.db')
      
      const filesToDelete = [
        dbPath,
        path.join(dbDir, `${dbName}.db-wal`),
        path.join(dbDir, `${dbName}.db-shm`)
      ]
      
      for (const file of filesToDelete) {
        if (fs.existsSync(file)) {
          try {
            fs.unlinkSync(file)
            console.log(`Removed existing file: ${file}`)
          } catch (error) {
            console.log(`Could not remove ${file}:`, error)
          }
        }
      }
      
      // Small delay to ensure file system operations complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Initialize database with encryption
      this.db = new Database(this.config.databasePath, {
        verbose: console.log,
        timeout: this.config.timeout
      })

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('synchronous = NORMAL')
      this.db.pragma('cache_size = 10000')
      this.db.pragma('temp_store = MEMORY')

      // Create tables with security features
      await this.createTables()
      
      // Initialize with default data
      await this.initializeDefaultData()

      this.isInitialized = true
      console.log('Secure database initialized successfully')
    } catch (error) {
      console.error('Failed to initialize database:', error)
      throw error
    }
  }



  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Roles table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Users table with security features (based on Laravel User model)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT,
        ext_name TEXT,
        gender TEXT,
        birthdate TEXT,
        email TEXT UNIQUE NOT NULL,
        email_verified_at TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        token TEXT,
        token_expiry TEXT,
        is_new BOOLEAN DEFAULT 1,
        role_id INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        failed_login_attempts INTEGER DEFAULT 0,
        last_failed_login TEXT,
        last_login TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        password_changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE SET NULL
      )
    `)

    // Sessions table for secure session management
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_activity TEXT DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `)

    // Audit log for security monitoring
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        table_name TEXT,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `)

    // Encryption keys table for additional security layers
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS encryption_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT UNIQUE NOT NULL,
        encrypted_key TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT,
        is_active BOOLEAN DEFAULT 1
      )
    `)

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_roles_slug ON roles(slug);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
      CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
    `)

    // Offline-first domain tables
    // Class Sections
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS class_sections (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        grade_level TEXT,
        institution_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Subjects
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        variant TEXT,
        class_section_id TEXT NOT NULL,
        institution_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_section_id) REFERENCES class_sections (id) ON DELETE CASCADE
      )
    `)

    // Teacher assigned subjects
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assigned_subjects (
        subject_id TEXT PRIMARY KEY,
        teacher_user_id TEXT NOT NULL,
        assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE
      )
    `)

    // Students
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        lrn TEXT,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL,
        ext_name TEXT,
        gender TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Student-Section membership
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS student_sections (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        academic_year TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
        FOREIGN KEY (section_id) REFERENCES class_sections (id) ON DELETE CASCADE
      )
    `)

    // Subject ECR components
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subject_ecr (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        title TEXT NOT NULL,
        percentage REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE
      )
    `)

    // Subject ECR items
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subject_ecr_items (
        id TEXT PRIMARY KEY,
        subject_ecr_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        score INTEGER,
        category TEXT,
        quarter TEXT,
        academic_year TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_ecr_id) REFERENCES subject_ecr (id) ON DELETE CASCADE
      )
    `)

    // Student scores
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS student_scores (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        subject_ecr_item_id TEXT NOT NULL,
        score REAL NOT NULL,
        date_submitted TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, subject_ecr_item_id),
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
        FOREIGN KEY (subject_ecr_item_id) REFERENCES subject_ecr_items (id) ON DELETE CASCADE
      )
    `)

    // Outbox for offline sync
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Indexes for offline tables
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_subjects_class_section_id ON subjects(class_section_id);
      CREATE INDEX IF NOT EXISTS idx_assigned_subjects_teacher ON assigned_subjects(teacher_user_id);
      CREATE INDEX IF NOT EXISTS idx_student_sections_section_id ON student_sections(section_id);
      CREATE INDEX IF NOT EXISTS idx_scores_student ON student_scores(student_id);
      CREATE INDEX IF NOT EXISTS idx_scores_item ON student_scores(subject_ecr_item_id);
    `)
  }

  private async initializeDefaultData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Create default roles if they don't exist
    const rolesExist = this.db.prepare('SELECT COUNT(*) as count FROM roles').get() as { count: number }
    
    if (rolesExist.count === 0) {
      // Insert default roles
      this.db.prepare(`
        INSERT INTO roles (title, slug) VALUES 
        ('Administrator', 'administrator'),
        ('Teacher', 'teacher'),
        ('Student', 'student'),
        ('Parent', 'parent')
      `).run()
    }

    // Check if admin user exists
    const adminExists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?').get('admin@scholastic.local') as { count: number }
    
    if (adminExists.count === 0) {
      // Get admin role ID
      const adminRole = this.db.prepare('SELECT id FROM roles WHERE slug = ?').get('administrator') as { id: number }
      
      if (adminRole) {
        // Create default admin user
        const salt = crypto.randomBytes(16).toString('hex')
        const passwordHash = this.hashPassword('admin123', salt)
        const userId = crypto.randomUUID()
        
        this.db.prepare(`
          INSERT INTO users (id, first_name, last_name, email, password_hash, salt, role_id, is_active, is_new)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, 'Admin', 'User', 'admin@scholastic.local', passwordHash, salt, adminRole.id, 1, 0)
      }
    }

    // Check if subject-teacher user exists
    const teacherExists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?').get('teacher@scholastic.local') as { count: number }
    
    if (teacherExists.count === 0) {
      // Get teacher role ID
      const teacherRole = this.db.prepare('SELECT id FROM roles WHERE slug = ?').get('teacher') as { id: number }
      
      if (teacherRole) {
        // Create default subject-teacher user
        const salt = crypto.randomBytes(16).toString('hex')
        const passwordHash = this.hashPassword('teacher123', salt)
        const userId = crypto.randomUUID()
        
        this.db.prepare(`
          INSERT INTO users (id, first_name, last_name, email, password_hash, salt, role_id, is_active, is_new)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, 'John', 'Doe', 'teacher@scholastic.local', passwordHash, salt, teacherRole.id, 1, 0)
      }
    }
  }

  public hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
  }

  public verifyPassword(password: string, hash: string, salt: string): boolean {
    const computedHash = this.hashPassword(password, salt)
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'))
  }

  public async authenticateUser(email: string, password: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not initialized')

    const user = this.db.prepare(`
      SELECT u.*, r.title as role_title, r.slug as role_slug 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.email = ? AND u.is_active = 1
    `).get(email) as any
    
    if (!user) {
      await this.logFailedLogin(email)
      return null
    }

    if (this.verifyPassword(password, user.password_hash, user.salt)) {
      // Reset failed login attempts
      this.db.prepare('UPDATE users SET failed_login_attempts = 0, last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
      
      return {
        id: user.id,
        firstName: user.first_name,
        middleName: user.middle_name,
        lastName: user.last_name,
        extName: user.ext_name,
        gender: user.gender,
        birthdate: user.birthdate,
        email: user.email,
        emailVerifiedAt: user.email_verified_at,
        token: user.token,
        tokenExpiry: user.token_expiry,
        isNew: user.is_new === 1,
        roleId: user.role_id,
        roleTitle: user.role_title,
        roleSlug: user.role_slug,
        isActive: user.is_active === 1,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    } else {
      await this.logFailedLogin(email)
      return null
    }
  }

  private async logFailedLogin(email: string): Promise<void> {
    if (!this.db) return

    this.db.prepare(`
      UPDATE users 
      SET failed_login_attempts = failed_login_attempts + 1, 
          last_failed_login = CURRENT_TIMESTAMP 
      WHERE email = ?
    `).run(email)
  }

  public createSession(userId: string, token: string, expiresAt: Date): Session {
    if (!this.db) throw new Error('Database not initialized')

    const sessionId = crypto.randomUUID()
    
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, userId, token, expiresAt.toISOString())

    return {
      id: sessionId,
      userId,
      token,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString()
    }
  }

  public validateSession(sessionId: string): Session | null {
    if (!this.db) throw new Error('Database not initialized')

    const session = this.db.prepare(`
      SELECT * FROM sessions 
      WHERE id = ? AND expires_at > CURRENT_TIMESTAMP
    `).get(sessionId) as any

    if (!session) return null

    // Update last activity
    this.db.prepare('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId)

    return {
      id: session.id,
      userId: session.user_id,
      token: session.token,
      expiresAt: session.expires_at,
      createdAt: session.created_at
    }
  }

  public deleteSession(sessionId: string): void {
    if (!this.db) throw new Error('Database not initialized')
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  }

  public cleanupExpiredSessions(): void {
    if (!this.db) throw new Error('Database not initialized')
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run()
  }

  public logAuditEvent(userId: number | null, action: string, tableName?: string, recordId?: number, oldValues?: any, newValues?: any): void {
    if (!this.db) return

    this.db.prepare(`
      INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      action,
      tableName,
      recordId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null
    )
  }

  public backup(): string {
    if (!this.db) throw new Error('Database not initialized')

    const backupPath = this.config.databasePath.replace('.db', `_backup_${Date.now()}.db`)
    this.db.backup(backupPath)
    return backupPath
  }

  public close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.isInitialized = false
    }
  }

  public getDatabaseStats(): any {
    if (!this.db) throw new Error('Database not initialized')

    const stats = {
      users: (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count,
      sessions: (this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count,
      activeSessions: (this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE expires_at > CURRENT_TIMESTAMP').get() as { count: number }).count,
      auditLogs: (this.db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }).count
    }

    return stats
  }

  public getUserById(userId: string): User | null {
    if (!this.db) throw new Error('Database not initialized')

    const user = this.db.prepare(`
      SELECT u.*, r.title as role_title, r.slug as role_slug 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ? AND u.is_active = 1
    `).get(userId) as any
    
    if (!user) return null

    return {
      id: user.id,
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      extName: user.ext_name,
      gender: user.gender,
      birthdate: user.birthdate,
      email: user.email,
      emailVerifiedAt: user.email_verified_at,
      token: user.token,
      tokenExpiry: user.token_expiry,
      isNew: user.is_new === 1,
      roleId: user.role_id,
      roleTitle: user.role_title,
      roleSlug: user.role_slug,
      isActive: user.is_active === 1,
      lastLogin: user.last_login,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }
  }

  public async createUser(userData: {
    firstName: string
    lastName?: string
    email: string
    password: string
    roleSlug: string
  }): Promise<User> {
    if (!this.db) throw new Error('Database not initialized')

    // Check if user already exists
    const existingUser = this.db.prepare('SELECT id FROM users WHERE email = ?').get(userData.email)
    if (existingUser) {
      throw new Error('User with this email already exists')
    }

    // Get role ID
    const role = this.db.prepare('SELECT id FROM roles WHERE slug = ?').get(userData.roleSlug) as { id: number }
    if (!role) {
      throw new Error('Role not found')
    }

    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = this.hashPassword(userData.password, salt)
    const userId = crypto.randomUUID()

    this.db.prepare(`
      INSERT INTO users (id, first_name, last_name, email, password_hash, salt, role_id, is_active, is_new)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, userData.firstName, userData.lastName || '', userData.email, passwordHash, salt, role.id, 1, 1)

    return this.getUserById(userId)!
  }

  public getUsers(): User[] {
    if (!this.db) throw new Error('Database not initialized')

    const users = this.db.prepare(`
      SELECT u.*, r.title as role_title, r.slug as role_slug 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.is_active = 1 
      ORDER BY u.first_name, u.last_name
    `).all() as any[]
    
    return users.map(user => ({
      id: user.id,
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      extName: user.ext_name,
      gender: user.gender,
      birthdate: user.birthdate,
      email: user.email,
      emailVerifiedAt: user.email_verified_at,
      token: user.token,
      tokenExpiry: user.token_expiry,
      isNew: user.is_new === 1,
      roleId: user.role_id,
      roleTitle: user.role_title,
      roleSlug: user.role_slug,
      isActive: user.is_active === 1,
      lastLogin: user.last_login,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }))
  }

  public async updateUser(userId: string, updates: Partial<{
    firstName: string
    lastName: string
    email: string
    roleSlug: string
    isActive: boolean
  }>): Promise<User> {
    if (!this.db) throw new Error('Database not initialized')

    const setClauses: string[] = []
    const values: any[] = []

    if (updates.firstName !== undefined) {
      setClauses.push('first_name = ?')
      values.push(updates.firstName)
    }
    if (updates.lastName !== undefined) {
      setClauses.push('last_name = ?')
      values.push(updates.lastName)
    }
    if (updates.email !== undefined) {
      setClauses.push('email = ?')
      values.push(updates.email)
    }
    if (updates.roleSlug !== undefined) {
      // Get role ID from slug
      const role = this.db.prepare('SELECT id FROM roles WHERE slug = ?').get(updates.roleSlug) as { id: number }
      if (role) {
        setClauses.push('role_id = ?')
        values.push(role.id)
      }
    }
    if (updates.isActive !== undefined) {
      setClauses.push('is_active = ?')
      values.push(updates.isActive ? 1 : 0)
    }

    if (setClauses.length === 0) {
      throw new Error('No updates provided')
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP')
    values.push(userId)

    this.db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

    const updatedUser = this.getUserById(userId)
    if (!updatedUser) {
      throw new Error('User not found')
    }

    return updatedUser
  }

  public async deleteUser(userId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Soft delete - set is_active to false
    this.db.prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId)
  }

  public async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized')

    const user = this.db.prepare('SELECT password_hash, salt FROM users WHERE id = ? AND is_active = 1').get(userId) as any
    
    if (!user) {
      return false
    }

    if (!this.verifyPassword(currentPassword, user.password_hash, user.salt)) {
      return false
    }

    const newSalt = crypto.randomBytes(16).toString('hex')
    const newPasswordHash = this.hashPassword(newPassword, newSalt)

    this.db.prepare(`
      UPDATE users 
      SET password_hash = ?, salt = ?, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newPasswordHash, newSalt, userId)

    return true
  }

  // ------------------------
  // Offline helpers & CRUD
  // ------------------------

  public isOfflineSeededForUser(teacherUserId: string): boolean {
    if (!this.db) throw new Error('Database not initialized')
    const row = this.db.prepare('SELECT COUNT(*) as count FROM assigned_subjects WHERE teacher_user_id = ?').get(teacherUserId) as { count: number }
    return (row?.count || 0) > 0
  }

  public upsertClassSections(sections: Array<{ id: string; title: string; grade_level?: string; institution_id?: string }>): void {
    if (!this.db) throw new Error('Database not initialized')
    const insert = this.db.prepare(`
      INSERT INTO class_sections (id, title, grade_level, institution_id)
      VALUES (@id, @title, @grade_level, @institution_id)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        grade_level = excluded.grade_level,
        institution_id = excluded.institution_id,
        updated_at = CURRENT_TIMESTAMP
    `)
    const tx = this.db.transaction((rows: any[]) => {
      for (const row of rows) insert.run(row)
    })
    tx(sections)
  }

  public upsertSubjects(subjects: Array<{ id: string; title: string; variant?: string; class_section_id: string; institution_id?: string }>): void {
    if (!this.db) throw new Error('Database not initialized')
    const insert = this.db.prepare(`
      INSERT INTO subjects (id, title, variant, class_section_id, institution_id)
      VALUES (@id, @title, @variant, @class_section_id, @institution_id)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        variant = excluded.variant,
        class_section_id = excluded.class_section_id,
        institution_id = excluded.institution_id,
        updated_at = CURRENT_TIMESTAMP
    `)
    const tx = this.db.transaction((rows: any[]) => {
      for (const row of rows) insert.run(row)
    })
    tx(subjects)
  }

  public upsertAssignedSubjects(teacherUserId: string, subjectIds: string[]): void {
    if (!this.db) throw new Error('Database not initialized')
    const insert = this.db.prepare(`
      INSERT INTO assigned_subjects (subject_id, teacher_user_id)
      VALUES (?, ?)
      ON CONFLICT(subject_id) DO UPDATE SET
        teacher_user_id = excluded.teacher_user_id,
        assigned_at = CURRENT_TIMESTAMP
    `)
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) insert.run(id, teacherUserId)
    })
    tx(subjectIds)
  }

  public upsertStudents(students: Array<{ id: string; lrn?: string; first_name: string; middle_name?: string; last_name: string; ext_name?: string; gender?: string }>): void {
    if (!this.db) throw new Error('Database not initialized')
    const insert = this.db.prepare(`
      INSERT INTO students (id, lrn, first_name, middle_name, last_name, ext_name, gender)
      VALUES (@id, @lrn, @first_name, @middle_name, @last_name, @ext_name, @gender)
      ON CONFLICT(id) DO UPDATE SET
        lrn = excluded.lrn,
        first_name = excluded.first_name,
        middle_name = excluded.middle_name,
        last_name = excluded.last_name,
        ext_name = excluded.ext_name,
        gender = excluded.gender,
        updated_at = CURRENT_TIMESTAMP
    `)
    const tx = this.db.transaction((rows: any[]) => {
      for (const row of rows) insert.run(row)
    })
    tx(students)
  }

  public upsertStudentSections(memberships: Array<{ id: string; student_id: string; section_id: string; academic_year?: string }>): void {
    if (!this.db) throw new Error('Database not initialized')
    const insert = this.db.prepare(`
      INSERT INTO student_sections (id, student_id, section_id, academic_year)
      VALUES (@id, @student_id, @section_id, @academic_year)
      ON CONFLICT(id) DO UPDATE SET
        student_id = excluded.student_id,
        section_id = excluded.section_id,
        academic_year = excluded.academic_year,
        updated_at = CURRENT_TIMESTAMP
    `)
    const tx = this.db.transaction((rows: any[]) => {
      for (const row of rows) insert.run(row)
    })
    tx(memberships)
  }

  public upsertSubjectEcr(components: Array<{ id: string; subject_id: string; title: string; percentage?: number }>): void {
    if (!this.db) throw new Error('Database not initialized')
    const insert = this.db.prepare(`
      INSERT INTO subject_ecr (id, subject_id, title, percentage)
      VALUES (@id, @subject_id, @title, @percentage)
      ON CONFLICT(id) DO UPDATE SET
        subject_id = excluded.subject_id,
        title = excluded.title,
        percentage = excluded.percentage,
        updated_at = CURRENT_TIMESTAMP
    `)
    const tx = this.db.transaction((rows: any[]) => {
      for (const row of rows) insert.run(row)
    })
    tx(components)
  }

  public upsertSubjectEcrItems(items: Array<{ id: string; subject_ecr_id: string; title: string; description?: string; score?: number; category?: string; quarter?: string; academic_year?: string }>): void {
    if (!this.db) throw new Error('Database not initialized')
    const insert = this.db.prepare(`
      INSERT INTO subject_ecr_items (id, subject_ecr_id, title, description, score, category, quarter, academic_year)
      VALUES (@id, @subject_ecr_id, @title, @description, @score, @category, @quarter, @academic_year)
      ON CONFLICT(id) DO UPDATE SET
        subject_ecr_id = excluded.subject_ecr_id,
        title = excluded.title,
        description = excluded.description,
        score = excluded.score,
        category = excluded.category,
        quarter = excluded.quarter,
        academic_year = excluded.academic_year,
        updated_at = CURRENT_TIMESTAMP
    `)
    const tx = this.db.transaction((rows: any[]) => {
      for (const row of rows) insert.run(row)
    })
    tx(items)
  }

  public upsertStudentScores(scores: Array<{ id?: string; student_id: string; subject_ecr_item_id: string; score: number; date_submitted?: string }>, addToOutbox = false): void {
    if (!this.db) throw new Error('Database not initialized')
    const upsert = this.db.prepare(`
      INSERT INTO student_scores (id, student_id, subject_ecr_item_id, score, date_submitted)
      VALUES (COALESCE(@id, lower(hex(randomblob(16)))), @student_id, @subject_ecr_item_id, @score, @date_submitted)
      ON CONFLICT(student_id, subject_ecr_item_id) DO UPDATE SET
        score = excluded.score,
        date_submitted = excluded.date_submitted,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `)
    const insertOutbox = this.db.prepare(`
      INSERT INTO outbox (id, type, payload) VALUES (lower(hex(randomblob(16))), @type, @payload)
    `)
    const tx = this.db.transaction((rows: any[]) => {
      for (const row of rows) {
        const res = upsert.get(row) as any
        if (addToOutbox) {
          const payload = {
            op: 'upsert_student_score',
            id: res?.id,
            student_id: row.student_id,
            subject_ecr_item_id: row.subject_ecr_item_id,
            score: row.score,
            date_submitted: row.date_submitted || null
          }
          insertOutbox.run({ type: 'student_score_upsert', payload: JSON.stringify(payload) })
        }
      }
    })
    tx(scores)
  }

  public getAssignedSubjectsForUser(teacherUserId: string): any[] {
    if (!this.db) throw new Error('Database not initialized')
    const rows = this.db.prepare(`
      SELECT s.*, cs.title as class_section_title, cs.grade_level, cs.institution_id
      FROM assigned_subjects a
      JOIN subjects s ON s.id = a.subject_id
      JOIN class_sections cs ON cs.id = s.class_section_id
      WHERE a.teacher_user_id = ?
      ORDER BY cs.title, s.title
    `).all(teacherUserId) as any[]
    return rows
  }

  public getStudentsBySection(sectionId: string): any[] {
    if (!this.db) throw new Error('Database not initialized')
    const rows = this.db.prepare(`
      SELECT st.* , ss.id as student_section_id, ss.academic_year
      FROM student_sections ss
      JOIN students st ON st.id = ss.student_id
      WHERE ss.section_id = ?
      ORDER BY st.last_name, st.first_name
    `).all(sectionId) as any[]
    return rows
  }

  public getEcrItemsBySubject(subjectId: string): any[] {
    if (!this.db) throw new Error('Database not initialized')
    const rows = this.db.prepare(`
      SELECT i.*
      FROM subject_ecr_items i
      JOIN subject_ecr e ON e.id = i.subject_ecr_id
      WHERE e.subject_id = ?
      ORDER BY i.created_at DESC
    `).all(subjectId) as any[]
    return rows
  }

  public getUnsyncedOutboxCount(): number {
    if (!this.db) throw new Error('Database not initialized')
    const row = this.db.prepare('SELECT COUNT(*) as count FROM outbox').get() as { count: number }
    return row?.count || 0
  }

  public getOutboxEntries(): Array<{ id: string; type: string; payload: any; created_at: string }> {
    if (!this.db) throw new Error('Database not initialized')
    const rows = this.db.prepare('SELECT id, type, payload, created_at FROM outbox ORDER BY created_at ASC').all() as any[]
    return rows.map(r => ({ id: r.id, type: r.type, payload: JSON.parse(r.payload), created_at: r.created_at }))
  }

  public clearOutboxByIds(ids: string[]): void {
    if (!this.db) throw new Error('Database not initialized')
    const del = this.db.prepare('DELETE FROM outbox WHERE id = ?')
    const tx = this.db.transaction((toDelete: string[]) => {
      for (const id of toDelete) del.run(id)
    })
    tx(ids)
  }

  public exportOutboxToFile(filePath: string, userId: string): { filePath: string; count: number } {
    if (!this.db) throw new Error('Database not initialized')
    const entries = this.getOutboxEntries()
    const batch = {
      version: 1,
      user_id: userId,
      generated_at: new Date().toISOString(),
      entries
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(batch, null, 2), 'utf8')
    return { filePath, count: entries.length }
  }
} 