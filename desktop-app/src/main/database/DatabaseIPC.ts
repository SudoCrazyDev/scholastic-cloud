import { ipcMain } from 'electron'
import { DatabaseManager } from './DatabaseManager'
import * as crypto from 'crypto'

export class DatabaseIPC {
  private static instance: DatabaseIPC
  private dbManager: DatabaseManager

  private constructor() {
    this.dbManager = DatabaseManager.getInstance()
    this.setupHandlers()
  }

  public static getInstance(): DatabaseIPC {
    if (!DatabaseIPC.instance) {
      DatabaseIPC.instance = new DatabaseIPC()
    }
    return DatabaseIPC.instance
  }

  private setupHandlers(): void {
    // Database initialization
    ipcMain.handle('database:initialize', async () => {
      try {
        await this.dbManager.initialize()
        return { success: true, message: 'Database initialized successfully' }
      } catch (error) {
        console.error('Database initialization error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })

    // User authentication
    ipcMain.handle('database:authenticate', async (_, email: string, password: string) => {
      try {
        const db = this.dbManager.getDatabase()
        const user = await db.authenticateUser(email, password)
        
        if (user) {
          // Create session
          const token = crypto.randomBytes(32).toString('hex')
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
          const session = db.createSession(user.id, token, expiresAt)
          
          return {
            success: true,
            user,
            session
          }
        } else {
          return {
            success: false,
            error: 'Invalid credentials'
          }
        }
      } catch (error) {
        console.error('Authentication error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Authentication failed' }
      }
    })

    // Session validation
    ipcMain.handle('database:validateSession', async (_, sessionId: string) => {
      try {
        const db = this.dbManager.getDatabase()
        const session = db.validateSession(sessionId)
        
        if (session) {
          // Get user details
          const user = db.getUserById(session.userId)
          return {
            success: true,
            session,
            user
          }
        } else {
          return {
            success: false,
            error: 'Invalid or expired session'
          }
        }
      } catch (error) {
        console.error('Session validation error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Session validation failed' }
      }
    })

    // Logout
    ipcMain.handle('database:logout', async (_, sessionId: string) => {
      try {
        const db = this.dbManager.getDatabase()
        db.deleteSession(sessionId)
        return { success: true, message: 'Logged out successfully' }
      } catch (error) {
        console.error('Logout error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Logout failed' }
      }
    })

    // Database backup
    ipcMain.handle('database:backup', async () => {
      try {
        const backupPath = await this.dbManager.backup()
        return { success: true, backupPath }
      } catch (error) {
        console.error('Backup error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Backup failed' }
      }
    })

    // Database stats
    ipcMain.handle('database:getStats', async () => {
      try {
        const stats = this.dbManager.getStats()
        return { success: true, stats }
      } catch (error) {
        console.error('Stats error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get stats' }
      }
    })

    // Create user
    ipcMain.handle('database:createUser', async (_, userData: {
      firstName: string
      lastName?: string
      email: string
      password: string
      roleSlug: string
    }) => {
      try {
        const db = this.dbManager.getDatabase()
        const user = await db.createUser(userData)
        return { success: true, user }
      } catch (error) {
        console.error('Create user error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create user' }
      }
    })

    // Get users
    ipcMain.handle('database:getUsers', async () => {
      try {
        const db = this.dbManager.getDatabase()
        const users = db.getUsers()
        return { success: true, users }
      } catch (error) {
        console.error('Get users error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get users' }
      }
    })

    // Update user
    ipcMain.handle('database:updateUser', async (_, userId: string, updates: Partial<{
      firstName: string
      lastName: string
      email: string
      roleSlug: string
      isActive: boolean
    }>) => {
      try {
        const db = this.dbManager.getDatabase()
        const user = await db.updateUser(userId, updates)
        return { success: true, user }
      } catch (error) {
        console.error('Update user error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update user' }
      }
    })

    // Delete user
    ipcMain.handle('database:deleteUser', async (_, userId: string) => {
      try {
        const db = this.dbManager.getDatabase()
        await db.deleteUser(userId)
        return { success: true, message: 'User deleted successfully' }
      } catch (error) {
        console.error('Delete user error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete user' }
      }
    })

    // Change password
    ipcMain.handle('database:changePassword', async (_, userId: string, currentPassword: string, newPassword: string) => {
      try {
        const db = this.dbManager.getDatabase()
        const success = await db.changePassword(userId, currentPassword, newPassword)
        return { success, message: success ? 'Password changed successfully' : 'Current password is incorrect' }
      } catch (error) {
        console.error('Change password error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to change password' }
      }
    })

    // Cleanup expired sessions
    ipcMain.handle('database:cleanupSessions', async () => {
      try {
        const db = this.dbManager.getDatabase()
        db.cleanupExpiredSessions()
        return { success: true, message: 'Expired sessions cleaned up' }
      } catch (error) {
        console.error('Cleanup sessions error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to cleanup sessions' }
      }
    })

    // Offline: check seeded status
    ipcMain.handle('offline:isSeeded', async (_, teacherUserId: string) => {
      try {
        const db = this.dbManager.getDatabase()
        const seeded = db.isOfflineSeededForUser(teacherUserId)
        return { success: true, seeded }
      } catch (error) {
        console.error('Offline isSeeded error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to check seed status' }
      }
    })

    // Offline: bulk upserts for initial seed
    ipcMain.handle('offline:seed', async (_, payload: {
      teacherUserId: string
      classSections: Array<{ id: string; title: string; grade_level?: string; institution_id?: string }>
      subjects: Array<{ id: string; title: string; variant?: string; class_section_id: string; institution_id?: string }>
      assignedSubjectIds: string[]
      students: Array<{ id: string; lrn?: string; first_name: string; middle_name?: string; last_name: string; ext_name?: string; gender?: string }>
      studentSections: Array<{ id: string; student_id: string; section_id: string; academic_year?: string }>
      subjectEcr: Array<{ id: string; subject_id: string; title: string; percentage?: number }>
      subjectEcrItems: Array<{ id: string; subject_ecr_id: string; title: string; description?: string; score?: number; category?: string; quarter?: string; academic_year?: string }>
    }) => {
      try {
        const db = this.dbManager.getDatabase()
        db.upsertClassSections(payload.classSections)
        db.upsertSubjects(payload.subjects)
        db.upsertAssignedSubjects(payload.teacherUserId, payload.assignedSubjectIds)
        db.upsertStudents(payload.students)
        db.upsertStudentSections(payload.studentSections)
        db.upsertSubjectEcr(payload.subjectEcr)
        db.upsertSubjectEcrItems(payload.subjectEcrItems)
        return { success: true }
      } catch (error) {
        console.error('Offline seed error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to seed offline data' }
      }
    })

    // Offline: query helpers
    ipcMain.handle('offline:getAssignedSubjects', async (_, teacherUserId: string) => {
      try {
        const db = this.dbManager.getDatabase()
        const subjects = db.getAssignedSubjectsForUser(teacherUserId)
        return { success: true, subjects }
      } catch (error) {
        console.error('Offline getAssignedSubjects error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get assigned subjects' }
      }
    })

    ipcMain.handle('offline:getStudentsBySection', async (_, sectionId: string) => {
      try {
        const db = this.dbManager.getDatabase()
        const students = db.getStudentsBySection(sectionId)
        return { success: true, students }
      } catch (error) {
        console.error('Offline getStudentsBySection error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get students' }
      }
    })

    ipcMain.handle('offline:getEcrItemsBySubject', async (_, subjectId: string) => {
      try {
        const db = this.dbManager.getDatabase()
        const items = db.getEcrItemsBySubject(subjectId)
        return { success: true, items }
      } catch (error) {
        console.error('Offline getEcrItemsBySubject error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get ecr items' }
      }
    })

    // Offline: upsert score and add to outbox
    ipcMain.handle('offline:upsertStudentScores', async (_, scores: Array<{ id?: string; student_id: string; subject_ecr_item_id: string; score: number; date_submitted?: string }>) => {
      try {
        const db = this.dbManager.getDatabase()
        db.upsertStudentScores(scores, true)
        return { success: true }
      } catch (error) {
        console.error('Offline upsertStudentScores error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save scores' }
      }
    })

    // Offline: outbox stats and export
    ipcMain.handle('offline:getOutboxCount', async () => {
      try {
        const db = this.dbManager.getDatabase()
        const count = db.getUnsyncedOutboxCount()
        return { success: true, count }
      } catch (error) {
        console.error('Offline getOutboxCount error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get outbox count' }
      }
    })

    ipcMain.handle('offline:getOutboxEntries', async () => {
      try {
        const db = this.dbManager.getDatabase()
        const entries = db.getOutboxEntries()
        return { success: true, entries }
      } catch (error) {
        console.error('Offline getOutboxEntries error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get outbox entries' }
      }
    })

    ipcMain.handle('offline:exportOutboxToFile', async (_, filePath: string, userId: string) => {
      try {
        const db = this.dbManager.getDatabase()
        const res = db.exportOutboxToFile(filePath, userId)
        return { success: true, ...res }
      } catch (error) {
        console.error('Offline exportOutboxToFile error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to export outbox' }
      }
    })

    ipcMain.handle('offline:clearOutboxByIds', async (_, ids: string[]) => {
      try {
        const db = this.dbManager.getDatabase()
        db.clearOutboxByIds(ids)
        return { success: true }
      } catch (error) {
        console.error('Offline clearOutboxByIds error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to clear outbox' }
      }
    })
  }

  public static initialize(): DatabaseIPC {
    return DatabaseIPC.getInstance()
  }
} 