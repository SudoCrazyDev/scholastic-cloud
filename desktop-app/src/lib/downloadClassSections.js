import { api } from "./api";
import { getCurrentUser } from "./db";
import { saveClassSection } from "./db";

/**
 * Download the current user's class sections from the backend
 * Only downloads class sections where adviser matches the user id
 */
export async function downloadCurrentUserClassSections() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !currentUser.token) {
      return {
        success: false,
        error: "No authenticated user found. Please log in again.",
      };
    }

    // Use the dedicated desktop endpoint
    const classSectionsResponse = await api.get("/api/desktop/class-sections", {
      headers: {
        Authorization: `Bearer ${currentUser.token}`,
      },
    });

    const classSectionsData = classSectionsResponse.data?.data;
    if (!Array.isArray(classSectionsData)) {
      return {
        success: false,
        error: "Invalid class sections response from server.",
      };
    }

    // Save each class section to the local database
    for (const classSection of classSectionsData) {
      await saveClassSection({
        id: classSection.id,
        institution_id: classSection.institution_id,
        grade_level: classSection.grade_level,
        title: classSection.title,
        adviser: classSection.adviser,
        academic_year: classSection.academic_year,
        status: classSection.status,
        deleted_at: classSection.deleted_at,
        created_at: classSection.created_at,
        updated_at: classSection.updated_at,
      });
    }

    return {
      success: true,
      classSections: classSectionsData,
      count: classSectionsData.length,
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return {
        success: false,
        error: "Authentication failed. Please log in again.",
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        error: "Class sections not found for this user.",
      };
    } else if (error.response?.data?.message) {
      return {
        success: false,
        error: error.response.data.message,
      };
    } else {
      return {
        success: false,
        error: error.message || "Failed to download class sections.",
      };
    }
  }
}

