import axios, { AxiosInstance } from 'axios';
import { getDatabase } from '../database';
import { StudentRepository } from '../database/repositories/StudentRepository';
import { ScoreRepository } from '../database/repositories/ScoreRepository';
import { SubjectRepository } from '../database/repositories/SubjectRepository';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export class SyncService {
  private db = getDatabase();
  private studentRepo = new StudentRepository();
  private subjectRepo = new SubjectRepository();

  async fetchInitialData(apiUrl: string, token: string): Promise<any> {
    const api = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    try {
      const results = {
        sections: 0,
        subjects: 0,
        students: 0,
        assignments: 0,
        errors: []
      };

      // Fetch user profile to get institution ID
      const profileResponse = await api.get('/profile');
      const profile = profileResponse.data?.data || profileResponse.data;

      // Fetch class sections
      try {
        const sectionsResponse = await api.get('/class-sections', {
          params: { per_page: 1000 }
        });
        const sections = sectionsResponse.data?.data || [];
        
        if (sections.length > 0) {
          await this.subjectRepo.bulkInsertSections(sections as any[]);
          results.sections = sections.length;
        }
      } catch (error: any) {
        console.error('Failed to fetch sections:', error);
        results.errors.push(`Sections: ${error.message}`);
      }

      // Fetch subjects
      try {
        const subjectsResponse = await api.get('/subjects', {
          params: { per_page: 1000 }
        });
        const subjects = subjectsResponse.data?.data || [];
        
        if (subjects.length > 0) {
          await this.subjectRepo.bulkInsertSubjects(subjects as any[]);
          results.subjects = subjects.length;
        }
      } catch (error: any) {
        console.error('Failed to fetch subjects:', error);
        results.errors.push(`Subjects: ${error.message}`);
      }

      // Fetch students for each section
      try {
        const sections = await this.subjectRepo.getAllSections();
        
        for (const section of sections) {
          try {
            const studentsResponse = await api.get(`/student-sections`, {
              params: { section_id: section.id }
            });
            const studentSections = studentsResponse.data?.data || [];
            
            // Extract unique students
            const studentsMap = new Map();
            const assignments = [];
            
            for (const ss of studentSections) {
              if (ss.student && !studentsMap.has(ss.student.id)) {
                studentsMap.set(ss.student.id, ss.student);
              }
              
              assignments.push({
                id: ss.id,
                student_id: ss.student_id,
                section_id: ss.section_id,
                academic_year: ss.academic_year || new Date().getFullYear().toString(),
                is_active: true
              });
            }
            
            // Bulk insert students
            const students = Array.from(studentsMap.values());
            if (students.length > 0) {
              await this.studentRepo.bulkInsertStudents(students as any[]);
              results.students += students.length;
            }
            
            // Insert student-section assignments
            if (assignments.length > 0) {
              const dbInstance = this.db.getDb();
              const transaction = dbInstance.transaction(() => {
                const stmt = dbInstance.prepare(`
                  INSERT OR REPLACE INTO student_sections (
                    id, student_id, section_id, academic_year, is_active, 
                    created_at, updated_at, synced
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                const now = new Date().toISOString();
                for (const assignment of assignments) {
                  stmt.run(
                    assignment.id,
                    assignment.student_id,
                    assignment.section_id,
                    assignment.academic_year,
                    1,
                    now,
                    now,
                    1
                  );
                }
              });
              transaction();
            }
          } catch (error: any) {
            console.error(`Failed to fetch students for section ${section.id}:`, error);
          }
        }
      } catch (error: any) {
        console.error('Failed to fetch students:', error);
        results.errors.push(`Students: ${error.message}`);
      }

      // Fetch subject assignments for each section
      try {
        const sections = await this.subjectRepo.getAllSections();
        
        for (const section of sections) {
          try {
            // Fetch subjects assigned to this section
            const subjectsResponse = await api.get(`/subjects/by-section/${section.id}`);
            const subjectAssignments = subjectsResponse.data?.data || [];
            
            if (subjectAssignments.length > 0) {
              const assignments = subjectAssignments.map((sa: any) => ({
                id: sa.id,
                subject_id: sa.subject_id || sa.id,
                section_id: section.id,
                teacher_id: sa.teacher_id || profile.id,
                academic_year: sa.academic_year || new Date().getFullYear().toString(),
                is_active: true
              }));
              
              await this.subjectRepo.bulkInsertSubjectAssignments(assignments as any[]);
              results.assignments += assignments.length;
            }
          } catch (error: any) {
            console.error(`Failed to fetch subject assignments for section ${section.id}:`, error);
          }
        }
      } catch (error: any) {
        console.error('Failed to fetch subject assignments:', error);
        results.errors.push(`Subject Assignments: ${error.message}`);
      }

      // Record sync history
      const dbInstance = this.db.getDb();
      const syncStmt = dbInstance.prepare(`
        INSERT INTO sync_history (sync_type, started_at, completed_at, records_synced, records_failed, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      const now = new Date().toISOString();
      const totalRecords = results.sections + results.subjects + results.students + results.assignments;
      const status = results.errors.length === 0 ? 'SUCCESS' : 'PARTIAL';
      
      syncStmt.run(
        'FULL',
        now,
        now,
        totalRecords,
        0,
        status,
        results.errors.length > 0 ? results.errors.join('; ') : null
      );

      return {
        success: true,
        ...results
      };
    } catch (error: any) {
      console.error('Initial data fetch failed:', error);
      throw error;
    }
  }

  async syncWithServer(apiUrl: string, token: string): Promise<any> {
    const api = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const unsyncedRecords = await this.db.getUnsyncedRecords();
    
    if (unsyncedRecords.length === 0) {
      return {
        success: true,
        message: 'No data to sync',
        recordsSynced: 0
      };
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    const syncedIds: number[] = [];

    for (const record of unsyncedRecords) {
      try {
        const data = JSON.parse(record.data);
        
        switch (record.table_name) {
          case 'students':
            await this.syncStudent(api, record.operation, data);
            break;
          case 'student_sections':
            await this.syncStudentSection(api, record.operation, data);
            break;
          case 'subjects':
            await this.syncSubject(api, record.operation, data);
            break;
          case 'subject_assignments':
            await this.syncSubjectAssignment(api, record.operation, data);
            break;
          case 'class_sections':
            await this.syncSection(api, record.operation, data);
            break;
          case 'grade_items':
            await this.syncGradeItem(api, record.operation, data);
            break;
          case 'student_scores':
            await this.syncStudentScore(api, record.operation, data);
            break;
          case 'quarterly_grades':
            await this.syncQuarterlyGrade(api, record.operation, data);
            break;
        }
        
        syncedIds.push(record.id);
        results.success++;
      } catch (error: any) {
        console.error(`Failed to sync record ${record.id}:`, error);
        results.failed++;
        results.errors.push(`${record.table_name} ${record.operation}: ${error.message}`);
      }
    }

    // Mark successfully synced records
    if (syncedIds.length > 0) {
      await this.db.markRecordsAsSynced(syncedIds);
    }

    // Record sync history
    const dbInstance = this.db.getDb();
    const syncStmt = dbInstance.prepare(`
      INSERT INTO sync_history (sync_type, started_at, completed_at, records_synced, records_failed, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    const status = results.failed === 0 ? 'SUCCESS' : (results.success > 0 ? 'PARTIAL' : 'FAILED');
    
    syncStmt.run(
      'PARTIAL',
      now,
      now,
      results.success,
      results.failed,
      status,
      results.errors.length > 0 ? results.errors.join('; ') : null
    );

    return {
      success: true,
      recordsSynced: results.success,
      recordsFailed: results.failed,
      errors: results.errors
    };
  }

  async exportUnsyncedData(): Promise<string> {
    const unsyncedRecords = await this.db.getUnsyncedRecords();
    
    if (unsyncedRecords.length === 0) {
      return '';
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      records: unsyncedRecords.map(record => ({
        table: record.table_name,
        operation: record.operation,
        data: JSON.parse(record.data)
      }))
    };

    // Save to file
    const exportPath = path.join(app.getPath('downloads'), `scholastic_sync_${Date.now()}.json`);
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
    
    return exportPath;
  }

  // Individual sync methods
  private async syncStudent(api: AxiosInstance, operation: string, data: any) {
    switch (operation) {
      case 'INSERT':
        await api.post('/students', data);
        break;
      case 'UPDATE':
        await api.put(`/students/${data.id}`, data);
        break;
      case 'DELETE':
        await api.delete(`/students/${data.id}`);
        break;
    }
  }

  private async syncStudentSection(api: AxiosInstance, operation: string, data: any) {
    switch (operation) {
      case 'INSERT':
        await api.post('/student-sections', data);
        break;
      case 'DELETE':
        await api.delete(`/student-sections/${data.id}`);
        break;
    }
  }

  private async syncSubject(api: AxiosInstance, operation: string, data: any) {
    switch (operation) {
      case 'INSERT':
        await api.post('/subjects', data);
        break;
      case 'UPDATE':
        await api.put(`/subjects/${data.id}`, data);
        break;
      case 'DELETE':
        await api.delete(`/subjects/${data.id}`);
        break;
    }
  }

  private async syncSubjectAssignment(api: AxiosInstance, operation: string, data: any) {
    switch (operation) {
      case 'INSERT':
        await api.post('/subject-assignments', data);
        break;
      case 'DELETE':
        await api.delete(`/subject-assignments/${data.id}`);
        break;
    }
  }

  private async syncSection(api: AxiosInstance, operation: string, data: any) {
    switch (operation) {
      case 'INSERT':
        await api.post('/class-sections', data);
        break;
      case 'UPDATE':
        await api.put(`/class-sections/${data.id}`, data);
        break;
      case 'DELETE':
        await api.delete(`/class-sections/${data.id}`);
        break;
    }
  }

  private async syncGradeItem(api: AxiosInstance, operation: string, data: any) {
    switch (operation) {
      case 'INSERT':
        await api.post('/grade-items', data);
        break;
      case 'UPDATE':
        await api.put(`/grade-items/${data.id}`, data);
        break;
      case 'DELETE':
        await api.delete(`/grade-items/${data.id}`);
        break;
    }
  }

  private async syncStudentScore(api: AxiosInstance, operation: string, data: any) {
    switch (operation) {
      case 'INSERT':
      case 'UPDATE':
        await api.post('/scores', data);
        break;
      case 'DELETE':
        await api.delete(`/scores/${data.id}`);
        break;
    }
  }

  private async syncQuarterlyGrade(api: AxiosInstance, _operation: string, data: any) {
    // Quarterly grades are calculated, just send the data for record keeping
    await api.post('/grades/save-quarterly', data);
  }
}