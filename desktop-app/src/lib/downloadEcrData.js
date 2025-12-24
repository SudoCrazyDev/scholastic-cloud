import { api } from "./api";
import { getCurrentUser } from "./db";
import { saveSubjectEcr } from "./db";
import { saveSubjectEcrItem } from "./db";
import { saveStudentEcrItemScore } from "./db";

/**
 * Download ECR data (subjects_ecr, subject_ecr_items, student_ecr_item_scores)
 * for all user's subjects
 */
export async function downloadEcrData() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !currentUser.token) {
      return {
        success: false,
        error: "No authenticated user found. Please log in again.",
      };
    }

    // Download ECR data from backend
    const ecrResponse = await api.get("/api/desktop/ecr-data", {
      headers: {
        Authorization: `Bearer ${currentUser.token}`,
      },
    });

    const ecrData = ecrResponse.data?.data;
    if (!Array.isArray(ecrData)) {
      return {
        success: false,
        error: "Invalid ECR data response from server.",
      };
    }

    // Track processed items to avoid duplicates
    const processedEcrs = new Set();
    const processedEcrItems = new Set();
    const processedScores = new Set();
    let savedEcrsCount = 0;
    let savedEcrItemsCount = 0;
    let savedScoresCount = 0;
    const errors = [];

    // Process each subject's ECR data
    for (const subjectData of ecrData) {
      const subjectEcrs = subjectData.subject_ecrs || [];
      
      for (const ecr of subjectEcrs) {
        // Save subject ECR
        if (!processedEcrs.has(ecr.id)) {
          try {
            await saveSubjectEcr({
              id: ecr.id,
              subject_id: ecr.subject_id,
              title: ecr.title,
              percentage: ecr.percentage,
              created_at: ecr.created_at,
              updated_at: ecr.updated_at,
            });
            processedEcrs.add(ecr.id);
            savedEcrsCount++;
          } catch (ecrError) {
            errors.push(`SubjectEcr ${ecr.id}: ${ecrError.message}`);
          }
        }

        // Save ECR items
        const items = ecr.items || [];
        for (const item of items) {
          if (!processedEcrItems.has(item.id)) {
            try {
              await saveSubjectEcrItem({
                id: item.id,
                subject_ecr_id: item.subject_ecr_id,
                type: item.type,
                title: item.title,
                description: item.description,
                quarter: item.quarter,
                academic_year: item.academic_year,
                score: item.score,
                created_at: item.created_at,
                updated_at: item.updated_at,
              });
              processedEcrItems.add(item.id);
              savedEcrItemsCount++;
            } catch (itemError) {
              errors.push(`SubjectEcrItem ${item.id}: ${itemError.message}`);
            }
          }

          // Save student scores
          const studentScores = item.student_scores || [];
          for (const score of studentScores) {
            if (!processedScores.has(score.id)) {
              try {
                await saveStudentEcrItemScore({
                  id: score.id,
                  student_id: score.student_id,
                  subject_ecr_item_id: score.subject_ecr_item_id,
                  score: score.score,
                  created_at: score.created_at,
                  updated_at: score.updated_at,
                });
                processedScores.add(score.id);
                savedScoresCount++;
              } catch (scoreError) {
                errors.push(`StudentEcrItemScore ${score.id}: ${scoreError.message}`);
              }
            }
          }
        }
      }
    }

    return {
      success: true,
      ecrsCount: savedEcrsCount,
      ecrItemsCount: savedEcrItemsCount,
      scoresCount: savedScoresCount,
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
        error: error.message || "Failed to download ECR data.",
      };
    }
  }
}

