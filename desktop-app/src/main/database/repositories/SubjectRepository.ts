import { getDatabase } from '../index';
import { v4 as uuidv4 } from 'uuid';

export interface Subject {
  id: string;
  name: string;
  code?: string;
  description?: string;
  grade_level?: string;
  institution_id?: string;
  created_at?: string;
  updated_at?: string;
  synced?: boolean;
}

export interface SubjectAssignment {
  id: string;
  subject_id: string;
  section_id: string;
  teacher_id?: string;
  academic_year?: string;
  is_active: boolean;
  subject?: Subject;
}

export interface ClassSection {
  id: string;
  name: string;
  grade_level: string;
  institution_id?: string;
  adviser_id?: string;
  academic_year?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  synced?: boolean;
}

export class SubjectRepository {
  private db = getDatabase();

  // Subjects
  async getAllSubjects(): Promise<Subject[]> {
    const stmt = this.db.getDb().prepare('SELECT * FROM subjects ORDER BY grade_level, name');
    return stmt.all() as Subject[];
  }

  async getSubjectById(id: string): Promise<Subject | null> {
    const stmt = this.db.getDb().prepare('SELECT * FROM subjects WHERE id = ?');
    return stmt.get(id) as Subject || null;
  }

  async getSubjectsBySection(sectionId: string): Promise<SubjectAssignment[]> {
    const stmt = this.db.getDb().prepare(`
      SELECT 
        sa.*,
        s.id as subject_id,
        s.name,
        s.code,
        s.description,
        s.grade_level
      FROM subject_assignments sa
      INNER JOIN subjects s ON sa.subject_id = s.id
      WHERE sa.section_id = ? AND sa.is_active = 1
      ORDER BY s.name
    `);
    
    const results = stmt.all(sectionId) as any[];
    
    return results.map(row => ({
      id: row.id,
      subject_id: row.subject_id,
      section_id: row.section_id,
      teacher_id: row.teacher_id,
      academic_year: row.academic_year,
      is_active: row.is_active,
      subject: {
        id: row.subject_id,
        name: row.name,
        code: row.code,
        description: row.description,
        grade_level: row.grade_level
      }
    }));
  }

  async createSubject(subject: Omit<Subject, 'id' | 'created_at' | 'updated_at'>): Promise<Subject> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT INTO subjects (
          id, name, code, description, grade_level, 
          institution_id, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        subject.name,
        subject.code || null,
        subject.description || null,
        subject.grade_level || null,
        subject.institution_id || null,
        now,
        now,
        0
      );

      // Add to sync queue
      this.db.addToSyncQueue('subjects', 'INSERT', id, { ...subject, id });
    });

    transaction();
    
    return { ...subject, id, created_at: now, updated_at: now, synced: false };
  }

  async updateSubject(id: string, updates: Partial<Subject>): Promise<void> {
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      const fields = Object.keys(updates).filter(key => 
        key !== 'id' && key !== 'created_at'
      );
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      
      const stmt = this.db.getDb().prepare(`
        UPDATE subjects 
        SET ${setClause}, updated_at = ?, synced = 0
        WHERE id = ?
      `);
      
      const values = fields.map(field => updates[field as keyof Subject]);
      stmt.run(...values, now, id);

      // Add to sync queue
      this.db.addToSyncQueue('subjects', 'UPDATE', id, { ...updates, id });
    });

    transaction();
  }

  async deleteSubject(id: string): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      // Delete subject assignments
      const deleteAssignStmt = this.db.getDb().prepare('DELETE FROM subject_assignments WHERE subject_id = ?');
      deleteAssignStmt.run(id);
      
      // Delete grade items
      const deleteItemsStmt = this.db.getDb().prepare('DELETE FROM grade_items WHERE subject_id = ?');
      deleteItemsStmt.run(id);
      
      // Delete subject
      const stmt = this.db.getDb().prepare('DELETE FROM subjects WHERE id = ?');
      stmt.run(id);

      // Add to sync queue
      this.db.addToSyncQueue('subjects', 'DELETE', id, { id });
    });

    transaction();
  }

  async bulkInsertSubjects(subjects: Subject[]): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT OR REPLACE INTO subjects (
          id, name, code, description, grade_level, 
          institution_id, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const subject of subjects) {
        const now = new Date().toISOString();
        stmt.run(
          subject.id,
          subject.name,
          subject.code || null,
          subject.description || null,
          subject.grade_level || null,
          subject.institution_id || null,
          subject.created_at || now,
          subject.updated_at || now,
          1 // Mark as synced since we're importing from server
        );
      }
    });

    transaction();
  }

  // Subject Assignments
  async assignSubjectToSection(subjectId: string, sectionId: string, teacherId?: string, academicYear?: string): Promise<void> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT OR REPLACE INTO subject_assignments (
          id, subject_id, section_id, teacher_id, academic_year, 
          is_active, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        subjectId,
        sectionId,
        teacherId || null,
        academicYear || new Date().getFullYear().toString(),
        1,
        now,
        now,
        0
      );

      // Add to sync queue
      this.db.addToSyncQueue('subject_assignments', 'INSERT', id, {
        id,
        subject_id: subjectId,
        section_id: sectionId,
        teacher_id: teacherId,
        academic_year: academicYear,
        is_active: true
      });
    });

    transaction();
  }

  async removeSubjectFromSection(assignmentId: string): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare('DELETE FROM subject_assignments WHERE id = ?');
      stmt.run(assignmentId);
      
      // Add to sync queue
      this.db.addToSyncQueue('subject_assignments', 'DELETE', assignmentId, { id: assignmentId });
    });

    transaction();
  }

  // Class Sections
  async getAllSections(): Promise<ClassSection[]> {
    const stmt = this.db.getDb().prepare('SELECT * FROM class_sections WHERE is_active = 1 ORDER BY grade_level, name');
    return stmt.all() as ClassSection[];
  }

  async getSectionById(id: string): Promise<ClassSection | null> {
    const stmt = this.db.getDb().prepare('SELECT * FROM class_sections WHERE id = ?');
    return stmt.get(id) as ClassSection || null;
  }

  async createSection(section: Omit<ClassSection, 'id' | 'created_at' | 'updated_at'>): Promise<ClassSection> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT INTO class_sections (
          id, name, grade_level, institution_id, adviser_id, 
          academic_year, is_active, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        section.name,
        section.grade_level,
        section.institution_id || null,
        section.adviser_id || null,
        section.academic_year || new Date().getFullYear().toString(),
        section.is_active ? 1 : 0,
        now,
        now,
        0
      );

      // Add to sync queue
      this.db.addToSyncQueue('class_sections', 'INSERT', id, { ...section, id });
    });

    transaction();
    
    return { ...section, id, created_at: now, updated_at: now, synced: false };
  }

  async updateSection(id: string, updates: Partial<ClassSection>): Promise<void> {
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      const fields = Object.keys(updates).filter(key => 
        key !== 'id' && key !== 'created_at'
      );
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      
      const stmt = this.db.getDb().prepare(`
        UPDATE class_sections 
        SET ${setClause}, updated_at = ?, synced = 0
        WHERE id = ?
      `);
      
      const values = fields.map(field => {
        const value = updates[field as keyof ClassSection];
        return field === 'is_active' ? (value ? 1 : 0) : value;
      });
      stmt.run(...values, now, id);

      // Add to sync queue
      this.db.addToSyncQueue('class_sections', 'UPDATE', id, { ...updates, id });
    });

    transaction();
  }

  async deleteSection(id: string): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      // Delete student sections
      const deleteSSStmt = this.db.getDb().prepare('DELETE FROM student_sections WHERE section_id = ?');
      deleteSSStmt.run(id);
      
      // Delete subject assignments
      const deleteAssignStmt = this.db.getDb().prepare('DELETE FROM subject_assignments WHERE section_id = ?');
      deleteAssignStmt.run(id);
      
      // Delete section
      const stmt = this.db.getDb().prepare('DELETE FROM class_sections WHERE id = ?');
      stmt.run(id);

      // Add to sync queue
      this.db.addToSyncQueue('class_sections', 'DELETE', id, { id });
    });

    transaction();
  }

  async bulkInsertSections(sections: ClassSection[]): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT OR REPLACE INTO class_sections (
          id, name, grade_level, institution_id, adviser_id, 
          academic_year, is_active, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const section of sections) {
        const now = new Date().toISOString();
        stmt.run(
          section.id,
          section.name,
          section.grade_level,
          section.institution_id || null,
          section.adviser_id || null,
          section.academic_year || new Date().getFullYear().toString(),
          section.is_active ? 1 : 0,
          section.created_at || now,
          section.updated_at || now,
          1 // Mark as synced since we're importing from server
        );
      }
    });

    transaction();
  }

  async bulkInsertSubjectAssignments(assignments: SubjectAssignment[]): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT OR REPLACE INTO subject_assignments (
          id, subject_id, section_id, teacher_id, academic_year, 
          is_active, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const now = new Date().toISOString();
      for (const assignment of assignments) {
        stmt.run(
          assignment.id || uuidv4(),
          assignment.subject_id,
          assignment.section_id,
          assignment.teacher_id || null,
          assignment.academic_year || new Date().getFullYear().toString(),
          assignment.is_active ? 1 : 0,
          now,
          now,
          1 // Mark as synced since we're importing from server
        );
      }
    });

    transaction();
  }
}