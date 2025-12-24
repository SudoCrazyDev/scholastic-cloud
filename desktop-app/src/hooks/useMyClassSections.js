import { useState, useEffect } from "react";
import { getCurrentUser, getUserClassSections } from "@/lib/db";

export function useMyClassSections() {
  const [classSections, setClassSections] = useState([]);
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
          setClassSections([]);
          return;
        }
        
        const sections = await getUserClassSections(currentUser.id);
        
        // Filter by search
        let filtered = sections;
        if (searchValue.trim()) {
          const searchLower = searchValue.toLowerCase();
          filtered = sections.filter(
            (section) =>
              section.title?.toLowerCase().includes(searchLower) ||
              section.grade_level?.toLowerCase().includes(searchLower) ||
              section.academic_year?.toLowerCase().includes(searchLower)
          );
        }
        
        setClassSections(filtered);
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
    classSections,
    loading,
    error,
    searchValue,
    handleSearchChange,
  };
}

