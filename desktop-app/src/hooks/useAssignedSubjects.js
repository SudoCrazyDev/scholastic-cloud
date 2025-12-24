import { useState, useEffect } from "react";
import { getCurrentUser, getUserSubjects, getClassSectionById } from "@/lib/db";

export function useAssignedSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          setSubjects([]);
          return;
        }
        
        const userSubjects = await getUserSubjects(currentUser.id);
        
        // Enrich subjects with class section data
        const enrichedSubjects = await Promise.all(
          userSubjects.map(async (subject) => {
            let classSection = null;
            if (subject.class_section_id) {
              classSection = await getClassSectionById(subject.class_section_id);
            }
            return {
              ...subject,
              class_section: classSection,
            };
          })
        );
        
        // Filter by search
        let filtered = enrichedSubjects;
        if (searchValue.trim()) {
          const searchLower = searchValue.toLowerCase();
          filtered = enrichedSubjects.filter(
            (subject) =>
              subject.title?.toLowerCase().includes(searchLower) ||
              subject.variant?.toLowerCase().includes(searchLower) ||
              subject.class_section?.title?.toLowerCase().includes(searchLower) ||
              subject.class_section?.grade_level?.toLowerCase().includes(searchLower)
          );
        }
        
        setSubjects(filtered);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [searchValue]);

  const handleSearchChange = (value) => {
    setSearchValue(value);
  };

  return {
    subjects,
    loading,
    error,
    searchValue,
    handleSearchChange,
  };
}

