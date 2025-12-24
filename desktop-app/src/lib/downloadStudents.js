import { api } from "./api";
import { getCurrentUser } from "./db";
import { saveStudent } from "./db";
import { saveStudentSection } from "./db";
import { getAllClassSections } from "./db";

/**
 * Download students for all class sections we have saved
 * This function:
 * 1. Gets all class sections from local DB
 * 2. For each class section, downloads students from backend
 * 3. Saves students and student_sections to local DB
 */
export async function downloadStudentsForClassSections() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !currentUser.token) {
      return {
        success: false,
        error: "No authenticated user found. Please log in again.",
      };
    }

    // Get all class sections from local database
    const classSections = await getAllClassSections();

    if (classSections.length === 0) {
      return {
        success: true,
        students: [],
        count: 0,
        studentSectionsCount: 0,
      };
    }

    // Track unique students and student_sections to avoid duplicates
    const processedStudents = new Set();
    const processedStudentSections = new Set();
    let savedStudentsCount = 0;
    let savedStudentSectionsCount = 0;
    const errors = [];

    // Process each class section
    for (const classSection of classSections) {
      try {
        // Download students for this class section
        const studentsResponse = await api.get(
          `/api/desktop/class-sections/${classSection.id}/students`,
          {
            headers: {
              Authorization: `Bearer ${currentUser.token}`,
            },
          }
        );

        const studentsData = studentsResponse.data?.data;
        if (!Array.isArray(studentsData)) {
          continue;
        }

        // Process each student
        for (const student of studentsData) {
          // Save student if not processed yet
          if (student && student.id && !processedStudents.has(student.id)) {
            try {
              await saveStudent({
                id: student.id,
                lrn: student.lrn,
                first_name: student.first_name,
                middle_name: student.middle_name,
                last_name: student.last_name,
                ext_name: student.ext_name,
                gender: student.gender,
                birthdate: student.birthdate,
                profile_picture: student.profile_picture,
                is_active: student.is_active,
                created_at: student.created_at,
                updated_at: student.updated_at,
              });
              processedStudents.add(student.id);
              savedStudentsCount++;
            } catch (studentError) {
              errors.push(`Student ${student.id}: ${studentError.message}`);
            }
          }

          // Save student_section if exists and not processed yet
          if (student.student_section && student.student_section.id) {
            const studentSectionId = student.student_section.id;
            if (!processedStudentSections.has(studentSectionId)) {
              try {
                await saveStudentSection({
                  id: studentSectionId,
                  student_id: student.id,
                  section_id: classSection.id,
                  academic_year: student.student_section.academic_year,
                  is_active: student.student_section.is_active,
                  is_promoted: student.student_section.is_promoted,
                  created_at: student.student_section.created_at,
                  updated_at: student.student_section.updated_at,
                });
                processedStudentSections.add(studentSectionId);
                savedStudentSectionsCount++;
              } catch (sectionError) {
                errors.push(`StudentSection ${studentSectionId}: ${sectionError.message}`);
              }
            }
          }
        }
      } catch (classSectionError) {
        errors.push(`ClassSection ${classSection.id}: ${classSectionError.message}`);
      }
    }

    return {
      success: true,
      studentsCount: savedStudentsCount,
      studentSectionsCount: savedStudentSectionsCount,
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
        error: error.message || "Failed to download students.",
      };
    }
  }
}

