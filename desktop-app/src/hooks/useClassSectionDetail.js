import { useState, useEffect } from "react";
import {
  getClassSectionById,
  getStudentsByClassSection,
  getSubjectsByClassSection,
} from "@/lib/db";

export function useClassSectionDetail(classSectionId) {
  const [classSection, setClassSection] = useState(null);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      if (!classSectionId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const [sectionData, studentsData, subjectsData] = await Promise.all([
          getClassSectionById(classSectionId),
          getStudentsByClassSection(classSectionId),
          getSubjectsByClassSection(classSectionId),
        ]);

        setClassSection(sectionData);
        setStudents(studentsData || []);
        setSubjects(subjectsData || []);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [classSectionId]);

  return {
    classSection,
    students,
    subjects,
    loading,
    error,
  };
}

