import { getDatabase } from '../index';
import { v4 as uuidv4 } from 'uuid';

export interface Student {
  id: string;
  lrn?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  contact_number?: string;
  email?: string;
  guardian_name?: string;
  guardian_contact?: string;
  created_at?: string;
  updated_at?: string;
  synced?: boolean;
}

export interface StudentSection {
  id: string;
  student_id: string;
  section_id: string;
  academic_year: string;
  is_active: boolean;
  student?: Student;
}

export class StudentRepository {
  private db = getDatabase();

  async getAllStudents(): Promise<Student[]> {
    const stmt = this.db.getDb().prepare('SELECT * FROM students ORDER BY last_name, first_name');
    return stmt.all() as Student[];
  }

  async getStudentById(id: string): Promise<Student | null> {
    const stmt = this.db.getDb().prepare('SELECT * FROM students WHERE id = ?');
    return stmt.get(id) as Student || null;
  }

  async getStudentsBySection(sectionId: string): Promise<StudentSection[]> {
    const stmt = this.db.getDb().prepare(`
      SELECT 
        ss.*,
        s.id as student_id,
        s.lrn,
        s.first_name,
        s.middle_name,
        s.last_name,
        s.gender,
        s.email,
        s.contact_number
      FROM student_sections ss
      INNER JOIN students s ON ss.student_id = s.id
      WHERE ss.section_id = ? AND ss.is_active = 1
      ORDER BY s.last_name, s.first_name
    `);
    
    const results = stmt.all(sectionId) as any[];
    
    return results.map(row => ({
      id: row.id,
      student_id: row.student_id,
      section_id: row.section_id,
      academic_year: row.academic_year,
      is_active: row.is_active,
      student: {
        id: row.student_id,
        lrn: row.lrn,
        first_name: row.first_name,
        middle_name: row.middle_name,
        last_name: row.last_name,
        gender: row.gender,
        email: row.email,
        contact_number: row.contact_number
      }
    }));
  }

  async createStudent(student: Omit<Student, 'id' | 'created_at' | 'updated_at'>): Promise<Student> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT INTO students (
          id, lrn, first_name, middle_name, last_name, 
          date_of_birth, gender, address, contact_number, email,
          guardian_name, guardian_contact, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        student.lrn || null,
        student.first_name,
        student.middle_name || null,
        student.last_name,
        student.date_of_birth || null,
        student.gender || null,
        student.address || null,
        student.contact_number || null,
        student.email || null,
        student.guardian_name || null,
        student.guardian_contact || null,
        now,
        now,
        0
      );

      // Add to sync queue
      this.db.addToSyncQueue('students', 'INSERT', id, { ...student, id });
    });

    transaction();
    
    return { ...student, id, created_at: now, updated_at: now, synced: false };
  }

  async updateStudent(id: string, updates: Partial<Student>): Promise<void> {
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      // Build dynamic update query
      const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created_at');
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      
      const stmt = this.db.getDb().prepare(`
        UPDATE students 
        SET ${setClause}, updated_at = ?, synced = 0
        WHERE id = ?
      `);
      
      const values = fields.map(field => updates[field as keyof Student]);
      stmt.run(...values, now, id);

      // Add to sync queue
      this.db.addToSyncQueue('students', 'UPDATE', id, { ...updates, id });
    });

    transaction();
  }

  async deleteStudent(id: string): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      // Delete student sections first
      const deleteSSStmt = this.db.getDb().prepare('DELETE FROM student_sections WHERE student_id = ?');
      deleteSSStmt.run(id);
      
      // Delete student scores
      const deleteScoresStmt = this.db.getDb().prepare('DELETE FROM student_scores WHERE student_id = ?');
      deleteScoresStmt.run(id);
      
      // Delete student
      const stmt = this.db.getDb().prepare('DELETE FROM students WHERE id = ?');
      stmt.run(id);

      // Add to sync queue
      this.db.addToSyncQueue('students', 'DELETE', id, { id });
    });

    transaction();
  }

  async bulkInsertStudents(students: Student[]): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT OR REPLACE INTO students (
          id, lrn, first_name, middle_name, last_name, 
          date_of_birth, gender, address, contact_number, email,
          guardian_name, guardian_contact, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const student of students) {
        const now = new Date().toISOString();
        stmt.run(
          student.id,
          student.lrn || null,
          student.first_name,
          student.middle_name || null,
          student.last_name,
          student.date_of_birth || null,
          student.gender || null,
          student.address || null,
          student.contact_number || null,
          student.email || null,
          student.guardian_name || null,
          student.guardian_contact || null,
          student.created_at || now,
          student.updated_at || now,
          1 // Mark as synced since we're importing from server
        );
      }
    });

    transaction();
  }

  async assignStudentsToSection(studentIds: string[], sectionId: string, academicYear: string): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT OR REPLACE INTO student_sections (id, student_id, section_id, academic_year, is_active, created_at, updated_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const now = new Date().toISOString();
      
      for (const studentId of studentIds) {
        const id = uuidv4();
        stmt.run(id, studentId, sectionId, academicYear, 1, now, now, 0);
        
        // Add to sync queue
        this.db.addToSyncQueue('student_sections', 'INSERT', id, {
          id,
          student_id: studentId,
          section_id: sectionId,
          academic_year: academicYear,
          is_active: true
        });
      }
    });

    transaction();
  }

  async removeStudentFromSection(studentSectionId: string): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare('DELETE FROM student_sections WHERE id = ?');
      stmt.run(studentSectionId);
      
      // Add to sync queue
      this.db.addToSyncQueue('student_sections', 'DELETE', studentSectionId, { id: studentSectionId });
    });

    transaction();
  }
}