import { useState, useEffect } from "react";
import {
  getSubjectById,
  getClassSectionById,
  getStudentsByClassSection,
  getInstitutionById,
} from "@/lib/db";

export function useSubjectDetail(subjectId) {
  const [subject, setSubject] = useState(null);
  const [classSection, setClassSection] = useState(null);
  const [students, setStudents] = useState([]);
  const [institution, setInstitution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      if (!subjectId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const subjectData = await getSubjectById(subjectId);
        if (!subjectData) {
          setError("Subject not found");
          setLoading(false);
          return;
        }

        setSubject(subjectData);

        // Load related data
        const [sectionData, studentsData, institutionData] = await Promise.all([
          subjectData.class_section_id
            ? getClassSectionById(subjectData.class_section_id)
            : Promise.resolve(null),
          subjectData.class_section_id
            ? getStudentsByClassSection(subjectData.class_section_id)
            : Promise.resolve([]),
          subjectData.institution_id
            ? getInstitutionById(subjectData.institution_id)
            : Promise.resolve(null),
        ]);

        setClassSection(sectionData);
        setStudents(studentsData || []);
        setInstitution(institutionData);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [subjectId]);

  return {
    subject,
    classSection,
    students,
    institution,
    loading,
    error,
  };
}

