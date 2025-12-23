import { api } from "./api";
import { getCurrentUser } from "./db";
import { saveSubject } from "./db";
import { saveClassSection } from "./db";
import { saveUser } from "./db";
import { getInstitutionById } from "./db";

/**
 * Download the current user's assigned loads (subjects where adviser matches user id)
 * This function cascades to:
 * 1. Save subjects
 * 2. Save class_sections (deduplicated)
 * 3. Save adviser users from class_sections (deduplicated)
 */
export async function downloadCurrentUserAssignedLoads() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !currentUser.token) {
      return {
        success: false,
        error: "No authenticated user found. Please log in again.",
      };
    }

    // Use the dedicated desktop endpoint
    const subjectsResponse = await api.get("/api/desktop/assigned-loads", {
      headers: {
        Authorization: `Bearer ${currentUser.token}`,
      },
    });

    const subjectsData = subjectsResponse.data?.data;
    if (!Array.isArray(subjectsData)) {
      // If data is empty array, that's still valid (user has no assigned loads)
      if (Array.isArray(subjectsResponse.data?.data) && subjectsResponse.data.data.length === 0) {
        return {
          success: true,
          subjects: [],
          count: 0,
          totalCount: 0,
          classSectionsCount: 0,
          usersCount: 0,
        };
      }
      return {
        success: false,
        error: "Invalid assigned loads response from server.",
      };
    }

    // Track unique class_sections and users to avoid duplicates
    const processedClassSections = new Set();
    const processedUsers = new Set();
    let savedSubjectsCount = 0;
    let errors = [];

    // Process each subject
    for (const subject of subjectsData) {
      try {
        // 1. Save the subject
        await saveSubject({
          id: subject.id,
          institution_id: subject.institution_id,
          class_section_id: subject.class_section_id,
          adviser: subject.adviser,
          subject_type: subject.subject_type,
          parent_subject_id: subject.parent_subject_id,
          title: subject.title,
          variant: subject.variant,
          start_time: subject.start_time,
          end_time: subject.end_time,
          is_limited_student: subject.is_limited_student,
          order: subject.order,
          created_at: subject.created_at,
          updated_at: subject.updated_at,
        });
        savedSubjectsCount++;

        // 2. Save class_section if it exists and hasn't been processed yet
        // Laravel serializes relationships in snake_case, so it will be class_section
        const classSection = subject.class_section || subject.classSection;
        if (classSection && classSection.id && !processedClassSections.has(classSection.id)) {
          try {
            // IMPORTANT: Check if institution exists first (FK constraint)
            const institutionExists = await getInstitutionById(classSection.institution_id);
            if (!institutionExists) {
              // Skip this class section if institution doesn't exist
              continue;
            }

            // IMPORTANT: Save the adviser user FIRST before saving the class section
            // This ensures the foreign key constraint is satisfied
            // The adviser relationship returns a User object when loaded
            // In Laravel JSON, it will be serialized as 'adviser' (the relationship name)
            const adviserUser = classSection.adviser;
            let adviserId = null;
            
            if (adviserUser) {
              if (typeof adviserUser === 'object' && adviserUser.id) {
                // It's a loaded relationship (User object)
                if (!processedUsers.has(adviserUser.id)) {
                  try {
                    await saveUser(adviserUser);
                    processedUsers.add(adviserUser.id);
                  } catch (userError) {
                    // If we can't save the user, we can't save the class section with FK constraint
                    // Skip this class section
                    continue;
                  }
                }
                adviserId = adviserUser.id;
              } else if (typeof adviserUser === 'string') {
                // It's just an ID string (relationship not loaded)
                // We can't enforce the FK constraint, so we'll save it as-is
                // SQLite will fail if the user doesn't exist, which is expected
                adviserId = adviserUser;
              }
            }

            // Now save the class section (adviser user should exist if it was an object)
            await saveClassSection({
              id: classSection.id,
              institution_id: classSection.institution_id,
              grade_level: classSection.grade_level,
              title: classSection.title,
              adviser: adviserId, // Use the ID (either from object or string)
              academic_year: classSection.academic_year,
              status: classSection.status,
              deleted_at: classSection.deleted_at,
              created_at: classSection.created_at,
              updated_at: classSection.updated_at,
            });
            processedClassSections.add(classSection.id);
          } catch (classSectionError) {
            // Continue processing even if class section save fails
          }
        }
      } catch (subjectError) {
        errors.push(`Subject ${subject.id}: ${subjectError.message}`);
        // Continue processing other subjects even if one fails
      }
    }

    // Return success if we saved at least some data
    if (savedSubjectsCount > 0) {
      return {
        success: true,
        subjects: subjectsData,
        count: savedSubjectsCount,
        totalCount: subjectsData.length,
        classSectionsCount: processedClassSections.size,
        usersCount: processedUsers.size,
        errors: errors.length > 0 ? errors : undefined,
      };
    } else {
      return {
        success: false,
        error: errors.length > 0 
          ? `Failed to save any subjects. Errors: ${errors.join('; ')}`
          : "Failed to save subjects.",
      };
    }
  } catch (error) {
    if (error.response?.status === 401) {
      return {
        success: false,
        error: "Authentication failed. Please log in again.",
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        error: "Assigned loads not found for this user.",
      };
    } else if (error.response?.data?.message) {
      return {
        success: false,
        error: error.response.data.message,
      };
    } else {
      return {
        success: false,
        error: error.message || "Failed to download assigned loads.",
      };
    }
  }
}

