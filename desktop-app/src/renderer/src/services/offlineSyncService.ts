import { api } from '../lib/api';

export interface InitialSeedResult {
  success: boolean;
  error?: string;
}

class OfflineSyncService {
  async isSeeded(teacherUserId: string) {
    return window.api.offline.isSeeded(teacherUserId);
  }

  async initialSeed(teacherUserId: string): Promise<InitialSeedResult> {
    try {
      const assignedSubjectsResp = await api.get('/users/my/subjects');
      const assignedSubjects = assignedSubjectsResp.data?.data || [];

      const subjectIds: string[] = assignedSubjects.map((s: any) => s.id);
      const sectionsMap = new Map<string, any>();
      const classSections: any[] = [];
      const subjects: any[] = [];

      for (const sub of assignedSubjects) {
        subjects.push({
          id: sub.id,
          title: sub.title,
          variant: sub.variant,
          class_section_id: sub.class_section?.id || sub.class_section_id,
          institution_id: sub.institution?.id || sub.institution_id
        });
        const cs = sub.class_section;
        if (cs && !sectionsMap.has(cs.id)) {
          sectionsMap.set(cs.id, cs);
          classSections.push({
            id: cs.id,
            title: cs.title,
            grade_level: cs.grade_level,
            institution_id: cs.institution_id
          });
        }
      }

      const students: any[] = [];
      const studentSections: any[] = [];
      for (const section of classSections) {
        const res = await api.get(`/student-sections`, { params: { section_id: section.id } });
        const list = res.data?.data || [];
        for (const ss of list) {
          const st = ss.student || ss;
          students.push({
            id: st.id,
            lrn: st.lrn,
            first_name: st.first_name,
            middle_name: st.middle_name,
            last_name: st.last_name,
            ext_name: st.ext_name,
            gender: st.gender
          });
          studentSections.push({
            id: ss.id,
            student_id: st.id,
            section_id: section.id,
            academic_year: ss.academic_year
          });
        }
      }

      const subjectEcr: any[] = [];
      const subjectEcrItems: any[] = [];
      for (const subjectId of subjectIds) {
        const ecrRes = await api.get('/subjects-ecr', { params: { subject_id: subjectId } });
        const ecrList = ecrRes.data?.data || ecrRes.data || [];
        for (const e of ecrList) {
          subjectEcr.push({ id: e.id, subject_id: e.subject_id, title: e.title, percentage: e.percentage });
          const itemsRes = await api.get('/subjects-ecr-items', { params: { subject_ecr_id: e.id } });
          const items = itemsRes.data?.data || itemsRes.data || [];
          for (const it of items) {
            subjectEcrItems.push({
              id: it.id,
              subject_ecr_id: it.subject_ecr_id,
              title: it.title,
              description: it.description,
              score: it.score,
              category: it.category,
              quarter: it.quarter,
              academic_year: it.academic_year
            });
          }
        }
      }

      const seedRes = await window.api.offline.seed({
        teacherUserId,
        classSections,
        subjects,
        assignedSubjectIds: subjectIds,
        students,
        studentSections,
        subjectEcr,
        subjectEcrItems
      });

      return seedRes;
    } catch (error: any) {
      console.error('Initial seed error:', error);
      return { success: false, error: error?.message || 'Failed initial seed' };
    }
  }

  async exportOutbox(filePath: string, userId: string) {
    return window.api.offline.exportOutboxToFile(filePath, userId);
  }
}

export const offlineSyncService = new OfflineSyncService();

