import { getDatabase } from '../index';
import { v4 as uuidv4 } from 'uuid';

export interface GradeItem {
  id: string;
  subject_id: string;
  title: string;
  description?: string;
  category: 'Written Works' | 'Performance Tasks' | 'Quarterly Assessment';
  quarter: 'First Quarter' | 'Second Quarter' | 'Third Quarter' | 'Fourth Quarter';
  total_score: number;
  date?: string;
  created_at?: string;
  updated_at?: string;
  synced?: boolean;
}

export interface StudentScore {
  id: string;
  student_id: string;
  grade_item_id: string;
  score: number;
  date_submitted?: string;
  remarks?: string;
  created_at?: string;
  updated_at?: string;
  synced?: boolean;
}

export interface QuarterlyGrade {
  id: string;
  student_id: string;
  subject_id: string;
  quarter: string;
  written_works_score?: number;
  written_works_ps?: number;
  written_works_ws?: number;
  performance_tasks_score?: number;
  performance_tasks_ps?: number;
  performance_tasks_ws?: number;
  quarterly_assessment_score?: number;
  quarterly_assessment_ps?: number;
  quarterly_assessment_ws?: number;
  initial_grade?: number;
  quarterly_grade?: number;
  created_at?: string;
  updated_at?: string;
  synced?: boolean;
}

export class ScoreRepository {
  private db = getDatabase();

  // Grade Items
  async getGradeItemsBySubject(subjectId: string): Promise<GradeItem[]> {
    const stmt = this.db.getDb().prepare(`
      SELECT * FROM grade_items 
      WHERE subject_id = ? 
      ORDER BY quarter, category, date DESC
    `);
    return stmt.all(subjectId) as GradeItem[];
  }

  async getGradeItemById(id: string): Promise<GradeItem | null> {
    const stmt = this.db.getDb().prepare('SELECT * FROM grade_items WHERE id = ?');
    return stmt.get(id) as GradeItem || null;
  }

  async createGradeItem(item: Omit<GradeItem, 'id' | 'created_at' | 'updated_at'>): Promise<GradeItem> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare(`
        INSERT INTO grade_items (
          id, subject_id, title, description, category, quarter, 
          total_score, date, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        item.subject_id,
        item.title,
        item.description || null,
        item.category,
        item.quarter,
        item.total_score,
        item.date || null,
        now,
        now,
        0
      );

      // Add to sync queue
      this.db.addToSyncQueue('grade_items', 'INSERT', id, { ...item, id });
    });

    transaction();
    
    return { ...item, id, created_at: now, updated_at: now, synced: false };
  }

  async updateGradeItem(id: string, updates: Partial<GradeItem>): Promise<void> {
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      const fields = Object.keys(updates).filter(key => 
        key !== 'id' && key !== 'created_at'
      );
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      
      const stmt = this.db.getDb().prepare(`
        UPDATE grade_items 
        SET ${setClause}, updated_at = ?, synced = 0
        WHERE id = ?
      `);
      
      const values = fields.map(field => updates[field as keyof GradeItem]);
      stmt.run(...values, now, id);

      // Add to sync queue
      this.db.addToSyncQueue('grade_items', 'UPDATE', id, { ...updates, id });
    });

    transaction();
  }

  async deleteGradeItem(id: string): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      // Delete associated scores first
      const deleteScoresStmt = this.db.getDb().prepare('DELETE FROM student_scores WHERE grade_item_id = ?');
      deleteScoresStmt.run(id);
      
      // Delete grade item
      const stmt = this.db.getDb().prepare('DELETE FROM grade_items WHERE id = ?');
      stmt.run(id);

      // Add to sync queue
      this.db.addToSyncQueue('grade_items', 'DELETE', id, { id });
    });

    transaction();
  }

  // Student Scores
  async getStudentScores(studentId: string, subjectId: string): Promise<StudentScore[]> {
    const stmt = this.db.getDb().prepare(`
      SELECT ss.* FROM student_scores ss
      INNER JOIN grade_items gi ON ss.grade_item_id = gi.id
      WHERE ss.student_id = ? AND gi.subject_id = ?
      ORDER BY gi.quarter, gi.category, gi.date DESC
    `);
    return stmt.all(studentId, subjectId) as StudentScore[];
  }

  async getScoresByGradeItem(gradeItemId: string): Promise<StudentScore[]> {
    const stmt = this.db.getDb().prepare(`
      SELECT * FROM student_scores 
      WHERE grade_item_id = ?
      ORDER BY student_id
    `);
    return stmt.all(gradeItemId) as StudentScore[];
  }

  async saveScore(score: Omit<StudentScore, 'id' | 'created_at' | 'updated_at'>): Promise<StudentScore> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      // Check if score already exists
      const checkStmt = this.db.getDb().prepare(`
        SELECT id FROM student_scores 
        WHERE student_id = ? AND grade_item_id = ?
      `);
      const existing = checkStmt.get(score.student_id, score.grade_item_id) as { id: string } | undefined;
      
      if (existing) {
        // Update existing score
        const updateStmt = this.db.getDb().prepare(`
          UPDATE student_scores 
          SET score = ?, date_submitted = ?, remarks = ?, updated_at = ?, synced = 0
          WHERE id = ?
        `);
        updateStmt.run(
          score.score,
          score.date_submitted || now,
          score.remarks || null,
          now,
          existing.id
        );
        
        // Add to sync queue
        this.db.addToSyncQueue('student_scores', 'UPDATE', existing.id, { ...score, id: existing.id });
        
        return { ...score, id: existing.id, updated_at: now, synced: false };
      } else {
        // Insert new score
        const insertStmt = this.db.getDb().prepare(`
          INSERT INTO student_scores (
            id, student_id, grade_item_id, score, date_submitted, 
            remarks, created_at, updated_at, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        insertStmt.run(
          id,
          score.student_id,
          score.grade_item_id,
          score.score,
          score.date_submitted || now,
          score.remarks || null,
          now,
          now,
          0
        );

        // Add to sync queue
        this.db.addToSyncQueue('student_scores', 'INSERT', id, { ...score, id });
        
        return { ...score, id, created_at: now, updated_at: now, synced: false };
      }
    });

    return transaction();
  }

  async bulkSaveScores(scores: Omit<StudentScore, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const now = new Date().toISOString();
      
      for (const score of scores) {
        // Check if score exists
        const checkStmt = this.db.getDb().prepare(`
          SELECT id FROM student_scores 
          WHERE student_id = ? AND grade_item_id = ?
        `);
        const existing = checkStmt.get(score.student_id, score.grade_item_id) as { id: string } | undefined;
        
        if (existing) {
          // Update existing
          const updateStmt = this.db.getDb().prepare(`
            UPDATE student_scores 
            SET score = ?, date_submitted = ?, remarks = ?, updated_at = ?, synced = 0
            WHERE id = ?
          `);
          updateStmt.run(
            score.score,
            score.date_submitted || now,
            score.remarks || null,
            now,
            existing.id
          );
          
          this.db.addToSyncQueue('student_scores', 'UPDATE', existing.id, { ...score, id: existing.id });
        } else {
          // Insert new
          const id = uuidv4();
          const insertStmt = this.db.getDb().prepare(`
            INSERT INTO student_scores (
              id, student_id, grade_item_id, score, date_submitted, 
              remarks, created_at, updated_at, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          insertStmt.run(
            id,
            score.student_id,
            score.grade_item_id,
            score.score,
            score.date_submitted || now,
            score.remarks || null,
            now,
            now,
            0
          );
          
          this.db.addToSyncQueue('student_scores', 'INSERT', id, { ...score, id });
        }
      }
    });

    transaction();
  }

  async deleteScore(id: string): Promise<void> {
    const transaction = this.db.getDb().transaction(() => {
      const stmt = this.db.getDb().prepare('DELETE FROM student_scores WHERE id = ?');
      stmt.run(id);

      // Add to sync queue
      this.db.addToSyncQueue('student_scores', 'DELETE', id, { id });
    });

    transaction();
  }

  // Quarterly Grades
  async calculateQuarterlyGrade(studentId: string, subjectId: string, quarter: string): Promise<QuarterlyGrade> {
    // Get all scores for the quarter
    const stmt = this.db.getDb().prepare(`
      SELECT 
        gi.category,
        gi.total_score,
        ss.score
      FROM grade_items gi
      LEFT JOIN student_scores ss ON gi.id = ss.grade_item_id AND ss.student_id = ?
      WHERE gi.subject_id = ? AND gi.quarter = ?
    `);
    
    const scores = stmt.all(studentId, subjectId, quarter) as Array<{
      category: string;
      total_score: number;
      score: number | null;
    }>;

    // Calculate by category
    const categories = {
      'Written Works': { score: 0, total: 0, weight: 0.30 },
      'Performance Tasks': { score: 0, total: 0, weight: 0.50 },
      'Quarterly Assessment': { score: 0, total: 0, weight: 0.20 }
    };

    for (const item of scores) {
      const cat = categories[item.category as keyof typeof categories];
      if (cat) {
        cat.score += item.score || 0;
        cat.total += item.total_score;
      }
    }

    // Calculate percentage scores and weighted scores
    const result: any = {
      student_id: studentId,
      subject_id: subjectId,
      quarter: quarter
    };

    let initialGrade = 0;

    for (const [key, cat] of Object.entries(categories)) {
      const prefix = key.toLowerCase().replace(' ', '_');
      result[`${prefix}_score`] = cat.score;
      
      if (cat.total > 0) {
        const ps = (cat.score / cat.total) * 100;
        const ws = ps * cat.weight;
        result[`${prefix}_ps`] = ps;
        result[`${prefix}_ws`] = ws;
        initialGrade += ws;
      } else {
        result[`${prefix}_ps`] = 0;
        result[`${prefix}_ws`] = 0;
      }
    }

    result.initial_grade = initialGrade;
    result.quarterly_grade = this.transmute(initialGrade);

    // Save to database
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const transaction = this.db.getDb().transaction(() => {
      // Check if grade exists
      const checkStmt = this.db.getDb().prepare(`
        SELECT id FROM quarterly_grades 
        WHERE student_id = ? AND subject_id = ? AND quarter = ?
      `);
      const existing = checkStmt.get(studentId, subjectId, quarter) as { id: string } | undefined;
      
      if (existing) {
        // Update existing
        const updateStmt = this.db.getDb().prepare(`
          UPDATE quarterly_grades 
          SET written_works_score = ?, written_works_ps = ?, written_works_ws = ?,
              performance_tasks_score = ?, performance_tasks_ps = ?, performance_tasks_ws = ?,
              quarterly_assessment_score = ?, quarterly_assessment_ps = ?, quarterly_assessment_ws = ?,
              initial_grade = ?, quarterly_grade = ?, updated_at = ?, synced = 0
          WHERE id = ?
        `);
        
        updateStmt.run(
          result.written_works_score,
          result.written_works_ps,
          result.written_works_ws,
          result.performance_tasks_score,
          result.performance_tasks_ps,
          result.performance_tasks_ws,
          result.quarterly_assessment_score,
          result.quarterly_assessment_ps,
          result.quarterly_assessment_ws,
          result.initial_grade,
          result.quarterly_grade,
          now,
          existing.id
        );
        
        result.id = existing.id;
      } else {
        // Insert new
        const insertStmt = this.db.getDb().prepare(`
          INSERT INTO quarterly_grades (
            id, student_id, subject_id, quarter,
            written_works_score, written_works_ps, written_works_ws,
            performance_tasks_score, performance_tasks_ps, performance_tasks_ws,
            quarterly_assessment_score, quarterly_assessment_ps, quarterly_assessment_ws,
            initial_grade, quarterly_grade, created_at, updated_at, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        insertStmt.run(
          id,
          studentId,
          subjectId,
          quarter,
          result.written_works_score,
          result.written_works_ps,
          result.written_works_ws,
          result.performance_tasks_score,
          result.performance_tasks_ps,
          result.performance_tasks_ws,
          result.quarterly_assessment_score,
          result.quarterly_assessment_ps,
          result.quarterly_assessment_ws,
          result.initial_grade,
          result.quarterly_grade,
          now,
          now,
          0
        );
        
        result.id = id;
      }
      
      // Add to sync queue
      this.db.addToSyncQueue('quarterly_grades', existing ? 'UPDATE' : 'INSERT', result.id, result);
    });

    transaction();
    
    return result as QuarterlyGrade;
  }

  private transmute(initialGrade: number): number {
    // DepEd K-12 Grading Scale
    if (initialGrade >= 100) return 100;
    if (initialGrade >= 98.40) return 99;
    if (initialGrade >= 96.80) return 98;
    if (initialGrade >= 95.20) return 97;
    if (initialGrade >= 93.60) return 96;
    if (initialGrade >= 92.00) return 95;
    if (initialGrade >= 90.40) return 94;
    if (initialGrade >= 88.80) return 93;
    if (initialGrade >= 87.20) return 92;
    if (initialGrade >= 85.60) return 91;
    if (initialGrade >= 84.00) return 90;
    if (initialGrade >= 82.40) return 89;
    if (initialGrade >= 80.80) return 88;
    if (initialGrade >= 79.20) return 87;
    if (initialGrade >= 77.60) return 86;
    if (initialGrade >= 76.00) return 85;
    if (initialGrade >= 74.40) return 84;
    if (initialGrade >= 72.80) return 83;
    if (initialGrade >= 71.20) return 82;
    if (initialGrade >= 69.60) return 81;
    if (initialGrade >= 68.00) return 80;
    if (initialGrade >= 66.40) return 79;
    if (initialGrade >= 64.80) return 78;
    if (initialGrade >= 63.20) return 77;
    if (initialGrade >= 61.60) return 76;
    if (initialGrade >= 60.00) return 75;
    if (initialGrade >= 56.00) return 74;
    if (initialGrade >= 52.00) return 73;
    if (initialGrade >= 48.00) return 72;
    if (initialGrade >= 44.00) return 71;
    if (initialGrade >= 40.00) return 70;
    if (initialGrade >= 36.00) return 69;
    if (initialGrade >= 32.00) return 68;
    if (initialGrade >= 28.00) return 67;
    if (initialGrade >= 24.00) return 66;
    if (initialGrade >= 20.00) return 65;
    if (initialGrade >= 16.00) return 64;
    if (initialGrade >= 12.00) return 63;
    if (initialGrade >= 8.00) return 62;
    if (initialGrade >= 4.00) return 61;
    return 60;
  }
}