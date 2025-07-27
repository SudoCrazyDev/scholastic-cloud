import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Database API for renderer
const databaseAPI = {
  // Database initialization
  initialize: () => ipcRenderer.invoke('database:initialize'),
  
  // Authentication
  authenticate: (username: string, password: string) => 
    ipcRenderer.invoke('database:authenticate', username, password),
  
  validateSession: (sessionId: string) => 
    ipcRenderer.invoke('database:validateSession', sessionId),
  
  logout: (sessionId: string) => 
    ipcRenderer.invoke('database:logout', sessionId),
  
  // User management
  createUser: (userData: { username: string; email: string; password: string; role: string }) =>
    ipcRenderer.invoke('database:createUser', userData),
  
  getUsers: () => ipcRenderer.invoke('database:getUsers'),
  
  updateUser: (userId: number, updates: Partial<{ username: string; email: string; role: string; isActive: boolean }>) =>
    ipcRenderer.invoke('database:updateUser', userId, updates),
  
  deleteUser: (userId: number) => ipcRenderer.invoke('database:deleteUser', userId),
  
  changePassword: (userId: number, currentPassword: string, newPassword: string) =>
    ipcRenderer.invoke('database:changePassword', userId, currentPassword, newPassword),
  
  // Database utilities
  backup: () => ipcRenderer.invoke('database:backup'),
  
  getStats: () => ipcRenderer.invoke('database:getStats'),
  
  cleanupSessions: () => ipcRenderer.invoke('database:cleanupSessions')
}

// Custom APIs for renderer
const api = {
  database: databaseAPI
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
