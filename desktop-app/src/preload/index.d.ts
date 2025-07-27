import { electronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: typeof electronAPI
    api: {
      database: {
        // Database initialization
        initialize(): Promise<{ success: boolean; message?: string; error?: string }>
        
        // Authentication
        authenticate(email: string, password: string): Promise<{
          success: boolean
          user?: {
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
          session?: {
            id: string
            userId: string
            token: string
            expiresAt: string
            createdAt: string
          }
          error?: string
        }>
        
        validateSession(sessionId: string): Promise<{
          success: boolean
          session?: {
            id: string
            userId: string
            token: string
            expiresAt: string
            createdAt: string
          }
          user?: {
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
          error?: string
        }>
        
        logout(sessionId: string): Promise<{ success: boolean; message?: string; error?: string }>
        
        // User management
        createUser(userData: {
          firstName: string
          lastName?: string
          email: string
          password: string
          roleSlug: string
        }): Promise<{
          success: boolean
          user?: {
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
          error?: string
        }>
        
        getUsers(): Promise<{
          success: boolean
          users?: Array<{
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
          }>
          error?: string
        }>
        
        updateUser(userId: string, updates: Partial<{
          firstName: string
          lastName: string
          email: string
          roleSlug: string
          isActive: boolean
        }>): Promise<{
          success: boolean
          user?: {
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
          error?: string
        }>
        
        deleteUser(userId: string): Promise<{ success: boolean; message?: string; error?: string }>
        
        changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{
          success: boolean
          message?: string
          error?: string
        }>
        
        // Database utilities
        backup(): Promise<{ success: boolean; backupPath?: string; error?: string }>
        
        getStats(): Promise<{
          success: boolean
          stats?: {
            users: number
            sessions: number
            activeSessions: number
            auditLogs: number
          }
          error?: string
        }>
        
        cleanupSessions(): Promise<{ success: boolean; message?: string; error?: string }>
      }
    }
  }
}
