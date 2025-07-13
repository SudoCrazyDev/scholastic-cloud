import { api } from '../lib/api'

interface StudentScore {
  student_id: string
  item_id: string
  score: number
  date_submitted?: string
}

interface GradeItem {
  id: string
  title: string
  date: string
  description: string
  total_score: number
  category: 'Written Works' | 'Performance Tasks' | 'Quarterly Assessment'
  quarter: 'First Quarter' | 'Second Quarter' | 'Third Quarter' | 'Fourth Quarter'
  subject_id: string
}

class ScoreService {
  async getScoresBySubject(subjectId: string) {
    const response = await api.get<{ success: boolean; data: StudentScore[] }>(`/scores/subject/${subjectId}`)
    return response.data
  }

  async getScoresByStudent(studentId: string, subjectId: string) {
    const response = await api.get<{ success: boolean; data: StudentScore[] }>(`/scores/student/${studentId}/subject/${subjectId}`)
    return response.data
  }

  async saveScore(score: StudentScore) {
    const response = await api.post<{ success: boolean; data: StudentScore }>('/scores', score)
    return response.data
  }

  async saveScores(scores: StudentScore[]) {
    const response = await api.post<{ success: boolean; data: StudentScore[] }>('/scores/bulk', { scores })
    return response.data
  }

  async updateScore(scoreId: string, score: Partial<StudentScore>) {
    const response = await api.put<{ success: boolean; data: StudentScore }>(`/scores/${scoreId}`, score)
    return response.data
  }

  async deleteScore(scoreId: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`/scores/${scoreId}`)
    return response.data
  }

  async getGradeItemsBySubject(subjectId: string) {
    const response = await api.get<{ success: boolean; data: GradeItem[] }>(`/grade-items/subject/${subjectId}`)
    return response.data
  }

  async createGradeItem(gradeItem: Omit<GradeItem, 'id'>) {
    const response = await api.post<{ success: boolean; data: GradeItem }>('/grade-items', gradeItem)
    return response.data
  }

  async updateGradeItem(gradeItemId: string, gradeItem: Partial<GradeItem>) {
    const response = await api.put<{ success: boolean; data: GradeItem }>(`/grade-items/${gradeItemId}`, gradeItem)
    return response.data
  }

  async deleteGradeItem(gradeItemId: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`/grade-items/${gradeItemId}`)
    return response.data
  }

  async getStudentGrades(studentId: string, subjectId: string) {
    const response = await api.get<{ success: boolean; data: any }>(`/grades/student/${studentId}/subject/${subjectId}`)
    return response.data
  }

  async calculateQuarterGrade(studentId: string, subjectId: string, quarter: string) {
    const response = await api.post<{ success: boolean; data: any }>('/grades/calculate-quarter', {
      student_id: studentId,
      subject_id: subjectId,
      quarter
    })
    return response.data
  }

  async calculateFinalGrade(studentId: string, subjectId: string) {
    const response = await api.post<{ success: boolean; data: any }>('/grades/calculate-final', {
      student_id: studentId,
      subject_id: subjectId
    })
    return response.data
  }
}

export const scoreService = new ScoreService() 