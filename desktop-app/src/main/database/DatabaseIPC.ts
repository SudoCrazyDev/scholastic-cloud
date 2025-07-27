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
  }

  public static initialize(): DatabaseIPC {
    return DatabaseIPC.getInstance()
  }
} 