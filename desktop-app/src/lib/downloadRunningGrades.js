import { api } from "./api";
import { getCurrentUser } from "./db";
import { saveStudentRunningGrade } from "./db";

/**
 * Download student running grades for user's subjects
 */
export async function downloadStudentRunningGrades() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !currentUser.token) {
      return {
        success: false,
        error: "No authenticated user found. Please log in again.",
      };
    }

    // Download running grades from backend
    const gradesResponse = await api.get("/api/desktop/running-grades", {
      headers: {
        Authorization: `Bearer ${currentUser.token}`,
      },
    });

    const gradesData = gradesResponse.data?.data;
    if (!Array.isArray(gradesData)) {
      return {
        success: false,
        error: "Invalid running grades response from server.",
      };
    }

    // Track processed grades to avoid duplicates
    const processedGrades = new Set();
    let savedGradesCount = 0;
    const errors = [];

    // Process each running grade
    for (const grade of gradesData) {
      if (!processedGrades.has(grade.id)) {
        try {
          await saveStudentRunningGrade({
            id: grade.id,
            student_id: grade.student_id,
            subject_id: grade.subject_id,
            quarter: grade.quarter,
            grade: grade.grade,
            final_grade: grade.final_grade,
            academic_year: grade.academic_year,
            note: grade.note,
            deleted_at: grade.deleted_at,
            created_at: grade.created_at,
            updated_at: grade.updated_at,
          });
          processedGrades.add(grade.id);
          savedGradesCount++;
        } catch (gradeError) {
          errors.push(`StudentRunningGrade ${grade.id}: ${gradeError.message}`);
        }
      }
    }

    return {
      success: true,
      gradesCount: savedGradesCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return {
        success: false,
        error: "Authentication failed. Please log in again.",
      };
    } else if (error.response?.data?.message) {
      return {
        success: false,
        error: error.response.data.message,
      };
    } else {
      return {
        success: false,
        error: error.message || "Failed to download student running grades.",
      };
    }
  }
}

