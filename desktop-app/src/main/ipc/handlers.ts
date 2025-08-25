import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database';
import { StudentRepository } from '../database/repositories/StudentRepository';
import { ScoreRepository } from '../database/repositories/ScoreRepository';
import { SubjectRepository } from '../database/repositories/SubjectRepository';
import { SyncService } from '../services/SyncService';
import axios from 'axios';

const studentRepo = new StudentRepository();
const scoreRepo = new ScoreRepository();
const subjectRepo = new SubjectRepository();
let syncService: SyncService;

// Initialize sync service after database is ready
setTimeout(() => {
  syncService = new SyncService();
}, 1000);

export function registerIpcHandlers() {
  const db = getDatabase();

  // Authentication handlers
  ipcMain.handle('auth:login', async (_event: IpcMainInvokeEvent, email: string, password: string, apiUrl: string) => {
    try {
      // Try online login first
      const response = await axios.post(`${apiUrl}/login`, { email, password });
      const data = response.data?.data || response.data;
      
      if (data && data.token) {
        // Save credentials for offline use
        const userResponse = await axios.get(`${apiUrl}/profile`, {
          headers: { Authorization: `Bearer ${data.token}` }
        });
        const user = userResponse.data?.data || userResponse.data;
        
        await db.saveUserCredentials(user, password, data.token);
        
        return {
          success: true,
          user,
          token: data.token,
          isOnline: true
        };
      }
    } catch (error) {
      console.log('Online login failed, trying offline:', error);
      
      // Try offline login
      const user = await db.authenticateUser(email, password);
      if (user) {
        return {
          success: true,
          user,
          token: null,
          isOnline: false
        };
      }
      
      throw new Error('Invalid credentials');
    }
    throw new Error('Login failed');
  });

  ipcMain.handle('auth:logout', async () => {
    // Clear sensitive data but keep cached data for next login
    return { success: true };
  });

  // Student handlers
  ipcMain.handle('students:getAll', async () => {
    return await studentRepo.getAllStudents();
  });

  ipcMain.handle('students:getById', async (_event: IpcMainInvokeEvent, id: string) => {
    return await studentRepo.getStudentById(id);
  });

  ipcMain.handle('students:getBySection', async (_event: IpcMainInvokeEvent, sectionId: string) => {
    return await studentRepo.getStudentsBySection(sectionId);
  });

  ipcMain.handle('students:create', async (_event: IpcMainInvokeEvent, student: any) => {
    return await studentRepo.createStudent(student);
  });

  ipcMain.handle('students:update', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
    await studentRepo.updateStudent(id, updates);
    return { success: true };
  });

  ipcMain.handle('students:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    await studentRepo.deleteStudent(id);
    return { success: true };
  });

  ipcMain.handle('students:bulkInsert', async (_event: IpcMainInvokeEvent, students: any[]) => {
    await studentRepo.bulkInsertStudents(students);
    return { success: true };
  });

  ipcMain.handle('students:assignToSection', async (_event: IpcMainInvokeEvent, studentIds: string[], sectionId: string, academicYear: string) => {
    await studentRepo.assignStudentsToSection(studentIds, sectionId, academicYear);
    return { success: true };
  });

  // Subject and Section handlers
  ipcMain.handle('subjects:getAll', async () => {
    return await subjectRepo.getAllSubjects();
  });

  ipcMain.handle('subjects:getById', async (_event: IpcMainInvokeEvent, id: string) => {
    return await subjectRepo.getSubjectById(id);
  });

  ipcMain.handle('subjects:getBySection', async (_event: IpcMainInvokeEvent, sectionId: string) => {
    return await subjectRepo.getSubjectsBySection(sectionId);
  });

  ipcMain.handle('subjects:create', async (_event: IpcMainInvokeEvent, subject: any) => {
    return await subjectRepo.createSubject(subject);
  });

  ipcMain.handle('subjects:update', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
    await subjectRepo.updateSubject(id, updates);
    return { success: true };
  });

  ipcMain.handle('subjects:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    await subjectRepo.deleteSubject(id);
    return { success: true };
  });

  ipcMain.handle('subjects:bulkInsert', async (_event: IpcMainInvokeEvent, subjects: any[]) => {
    await subjectRepo.bulkInsertSubjects(subjects);
    return { success: true };
  });

  ipcMain.handle('subjects:assignToSection', async (_event: IpcMainInvokeEvent, subjectId: string, sectionId: string, teacherId?: string, academicYear?: string) => {
    await subjectRepo.assignSubjectToSection(subjectId, sectionId, teacherId, academicYear);
    return { success: true };
  });

  ipcMain.handle('subjects:bulkInsertAssignments', async (_event: IpcMainInvokeEvent, assignments: any[]) => {
    await subjectRepo.bulkInsertSubjectAssignments(assignments);
    return { success: true };
  });

  // Section handlers
  ipcMain.handle('sections:getAll', async () => {
    return await subjectRepo.getAllSections();
  });

  ipcMain.handle('sections:getById', async (_event: IpcMainInvokeEvent, id: string) => {
    return await subjectRepo.getSectionById(id);
  });

  ipcMain.handle('sections:create', async (_event: IpcMainInvokeEvent, section: any) => {
    return await subjectRepo.createSection(section);
  });

  ipcMain.handle('sections:update', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
    await subjectRepo.updateSection(id, updates);
    return { success: true };
  });

  ipcMain.handle('sections:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    await subjectRepo.deleteSection(id);
    return { success: true };
  });

  ipcMain.handle('sections:bulkInsert', async (_event: IpcMainInvokeEvent, sections: any[]) => {
    await subjectRepo.bulkInsertSections(sections);
    return { success: true };
  });

  // Score handlers
  ipcMain.handle('scores:getByStudent', async (_event: IpcMainInvokeEvent, studentId: string, subjectId: string) => {
    return await scoreRepo.getStudentScores(studentId, subjectId);
  });

  ipcMain.handle('scores:getByGradeItem', async (_event: IpcMainInvokeEvent, gradeItemId: string) => {
    return await scoreRepo.getScoresByGradeItem(gradeItemId);
  });

  ipcMain.handle('scores:save', async (_event: IpcMainInvokeEvent, score: any) => {
    return await scoreRepo.saveScore(score);
  });

  ipcMain.handle('scores:bulkSave', async (_event: IpcMainInvokeEvent, scores: any[]) => {
    await scoreRepo.bulkSaveScores(scores);
    return { success: true };
  });

  ipcMain.handle('scores:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    await scoreRepo.deleteScore(id);
    return { success: true };
  });

  // Grade Item handlers
  ipcMain.handle('gradeItems:getBySubject', async (_event: IpcMainInvokeEvent, subjectId: string) => {
    return await scoreRepo.getGradeItemsBySubject(subjectId);
  });

  ipcMain.handle('gradeItems:getById', async (_event: IpcMainInvokeEvent, id: string) => {
    return await scoreRepo.getGradeItemById(id);
  });

  ipcMain.handle('gradeItems:create', async (_event: IpcMainInvokeEvent, item: any) => {
    return await scoreRepo.createGradeItem(item);
  });

  ipcMain.handle('gradeItems:update', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
    await scoreRepo.updateGradeItem(id, updates);
    return { success: true };
  });

  ipcMain.handle('gradeItems:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    await scoreRepo.deleteGradeItem(id);
    return { success: true };
  });

  // Quarterly Grade handlers
  ipcMain.handle('grades:calculateQuarterly', async (_event: IpcMainInvokeEvent, studentId: string, subjectId: string, quarter: string) => {
    return await scoreRepo.calculateQuarterlyGrade(studentId, subjectId, quarter);
  });

  // Sync handlers
  ipcMain.handle('sync:getStatus', async () => {
    return await db.getSyncStatistics();
  });

  ipcMain.handle('sync:syncNow', async (_event: IpcMainInvokeEvent, apiUrl: string, token: string) => {
    if (!syncService) {
      syncService = new SyncService();
    }
    return await syncService.syncWithServer(apiUrl, token);
  });

  ipcMain.handle('sync:getUnsyncedData', async () => {
    return await db.getUnsyncedRecords();
  });

  ipcMain.handle('sync:exportData', async () => {
    if (!syncService) {
      syncService = new SyncService();
    }
    return await syncService.exportUnsyncedData();
  });

  ipcMain.handle('sync:importInitialData', async (_event: IpcMainInvokeEvent, apiUrl: string, token: string) => {
    if (!syncService) {
      syncService = new SyncService();
    }
    return await syncService.fetchInitialData(apiUrl, token);
  });

  // Database management
  ipcMain.handle('db:clearAll', async () => {
    await db.clearAllData();
    return { success: true };
  });

  ipcMain.handle('db:getStats', async () => {
    const dbInstance = db.getDb();
    const tables = [
      'students', 'class_sections', 'subjects', 'subject_assignments',
      'student_sections', 'grade_items', 'student_scores', 'quarterly_grades'
    ];
    
    const stats: any = {};
    for (const table of tables) {
      const stmt = dbInstance.prepare(`SELECT COUNT(*) as count FROM ${table}`);
      const result = stmt.get() as { count: number };
      stats[table] = result.count;
    }
    
    return stats;
  });
}