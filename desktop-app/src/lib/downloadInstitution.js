import { api } from "./api";
import { getCurrentUser } from "./db";
import { saveInstitution } from "./db";

/**
 * Download the current user's default institution from the API and save it locally
 * Uses the new /api/profile/institution endpoint which returns the full institution
 * based on user_institutions where is_default = true
 * 
 * @returns {Promise<{success: boolean, institution?: object, error?: string}>}
 */
export async function downloadCurrentUserInstitution() {
  try {
    // Get the current logged-in user from local DB
    const currentUser = await getCurrentUser();
    
    if (!currentUser || !currentUser.token) {
      return {
        success: false,
        error: "No authenticated user found. Please log in again.",
      };
    }

    // Fetch current user's default institution from desktop API endpoint
    const institutionResponse = await api.get("/api/desktop/institution", {
      headers: {
        Authorization: `Bearer ${currentUser.token}`,
      },
    });

    const institutionData = institutionResponse.data?.data;
    if (!institutionData) {
      return {
        success: false,
        error: "Invalid institution response from server.",
      };
    }

    // Save institution to local database
    await saveInstitution(institutionData);

    return {
      success: true,
      institution: institutionData,
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
        error: error.response.data?.message || "No default institution found for this user.",
      };
    } else if (error.response?.data?.message) {
      return {
        success: false,
        error: error.response.data.message,
      };
    } else {
      return {
        success: false,
        error: error.message || "Failed to download institution data.",
      };
    }
  }
}

