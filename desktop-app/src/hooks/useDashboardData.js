import { useState, useEffect } from "react";
import { getCurrentUser, getUserClassSections, getUserSubjects } from "@/lib/db";

export function useDashboardData() {
  const [user, setUser] = useState(null);
  const [classSectionsCount, setClassSectionsCount] = useState(0);
  const [subjectsCount, setSubjectsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          
          // Get counts
          const [classSections, subjects] = await Promise.all([
            getUserClassSections(currentUser.id),
            getUserSubjects(currentUser.id),
          ]);
          
          setClassSectionsCount(classSections.length);
          setSubjectsCount(subjects.length);
        }
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return {
    user,
    classSectionsCount,
    subjectsCount,
    loading,
    error,
  };
}

