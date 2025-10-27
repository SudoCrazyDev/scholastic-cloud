import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// API for renderer
const api = {
  // Authentication
  auth: {
    login: (email: string, password: string, apiUrl: string) => 
      ipcRenderer.invoke('auth:login', email, password, apiUrl),
    logout: () => ipcRenderer.invoke('auth:logout')
  },

  // Students
  students: {
    getAll: () => ipcRenderer.invoke('students:getAll'),
    getById: (id: string) => ipcRenderer.invoke('students:getById', id),
    getBySection: (sectionId: string) => ipcRenderer.invoke('students:getBySection', sectionId),
    create: (student: any) => ipcRenderer.invoke('students:create', student),
    update: (id: string, updates: any) => ipcRenderer.invoke('students:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('students:delete', id),
    bulkInsert: (students: any[]) => ipcRenderer.invoke('students:bulkInsert', students),
    assignToSection: (studentIds: string[], sectionId: string, academicYear: string) => 
      ipcRenderer.invoke('students:assignToSection', studentIds, sectionId, academicYear)
  },

  // Subjects
  subjects: {
    getAll: () => ipcRenderer.invoke('subjects:getAll'),
    getById: (id: string) => ipcRenderer.invoke('subjects:getById', id),
    getBySection: (sectionId: string) => ipcRenderer.invoke('subjects:getBySection', sectionId),
    create: (subject: any) => ipcRenderer.invoke('subjects:create', subject),
    update: (id: string, updates: any) => ipcRenderer.invoke('subjects:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('subjects:delete', id),
    bulkInsert: (subjects: any[]) => ipcRenderer.invoke('subjects:bulkInsert', subjects),
    assignToSection: (subjectId: string, sectionId: string, teacherId?: string, academicYear?: string) =>
      ipcRenderer.invoke('subjects:assignToSection', subjectId, sectionId, teacherId, academicYear),
    bulkInsertAssignments: (assignments: any[]) => 
      ipcRenderer.invoke('subjects:bulkInsertAssignments', assignments)
  },

  // Sections
  sections: {
    getAll: () => ipcRenderer.invoke('sections:getAll'),
    getById: (id: string) => ipcRenderer.invoke('sections:getById', id),
    create: (section: any) => ipcRenderer.invoke('sections:create', section),
    update: (id: string, updates: any) => ipcRenderer.invoke('sections:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('sections:delete', id),
    bulkInsert: (sections: any[]) => ipcRenderer.invoke('sections:bulkInsert', sections)
  },

  // Scores
  scores: {
    getByStudent: (studentId: string, subjectId: string) => 
      ipcRenderer.invoke('scores:getByStudent', studentId, subjectId),
    getByGradeItem: (gradeItemId: string) => 
      ipcRenderer.invoke('scores:getByGradeItem', gradeItemId),
    save: (score: any) => ipcRenderer.invoke('scores:save', score),
    bulkSave: (scores: any[]) => ipcRenderer.invoke('scores:bulkSave', scores),
    delete: (id: string) => ipcRenderer.invoke('scores:delete', id)
  },

  // Grade Items
  gradeItems: {
    getBySubject: (subjectId: string) => ipcRenderer.invoke('gradeItems:getBySubject', subjectId),
    getById: (id: string) => ipcRenderer.invoke('gradeItems:getById', id),
    create: (item: any) => ipcRenderer.invoke('gradeItems:create', item),
    update: (id: string, updates: any) => ipcRenderer.invoke('gradeItems:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('gradeItems:delete', id)
  },

  // Grades
  grades: {
    calculateQuarterly: (studentId: string, subjectId: string, quarter: string) =>
      ipcRenderer.invoke('grades:calculateQuarterly', studentId, subjectId, quarter)
  },

  // Sync
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    syncNow: (apiUrl: string, token: string) => ipcRenderer.invoke('sync:syncNow', apiUrl, token),
    getUnsyncedData: () => ipcRenderer.invoke('sync:getUnsyncedData'),
    exportData: () => ipcRenderer.invoke('sync:exportData'),
    importInitialData: (apiUrl: string, token: string) => 
      ipcRenderer.invoke('sync:importInitialData', apiUrl, token)
  },

  // Database management
  database: {
    clearAll: () => ipcRenderer.invoke('db:clearAll'),
    getStats: () => ipcRenderer.invoke('db:getStats')
  }
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