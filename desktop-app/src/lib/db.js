// Facade exports so app code can just do:
//   import { getDatabase, initDatabaseSchema } from "@/lib/db";
//
// The detailed structure (client, per-table schema files, etc.)
// stays encapsulated inside the db folder.

export { getDatabase } from "./db/client";
export { initDatabaseSchema } from "./db/schema";

// Query functions for users
export {
  getAllUsers,
  getUserByEmail,
  getUserById,
  getCurrentUser,
  getUserCount,
  saveUser,
  clearUserCache,
} from "./db/queries/users";

// Query functions for institutions
export {
  saveInstitution,
  getInstitutionById,
  getCurrentInstitution,
  getAllInstitutions,
  clearInstitutionCache,
} from "./db/queries/institutions";

// Query functions for class_sections
export {
  saveClassSection,
  getClassSectionById,
  getUserClassSections,
  getAllClassSections,
  getClassSectionsByInstitution,
  clearClassSectionCache,
} from "./db/queries/class_sections";

// Query functions for subjects
export {
  saveSubject,
  getSubjectById,
  getUserSubjects,
  getAllSubjects,
  getSubjectsByClassSection,
  clearSubjectCache,
} from "./db/queries/subjects";

// Query functions for students
export {
  saveStudent,
  getStudentById,
  getAllStudents,
  getStudentsByClassSection,
  clearStudentCache,
} from "./db/queries/students";

// Query functions for student_sections
export {
  saveStudentSection,
  getAllStudentSections,
  getStudentSectionsByClassSection,
  clearStudentSectionCache,
} from "./db/queries/student_sections";

// Query functions for subjects_ecr
export {
  createSubjectEcr,
  updateSubjectEcr,
  deleteSubjectEcr,
  deleteSubjectEcrsBySubjectId,
  saveSubjectEcr,
  getAllSubjectEcrs,
  getSubjectEcrsBySubjectId,
  clearSubjectEcrCache,
} from "./db/queries/subjects_ecr";

// Query functions for subject_ecr_items
export {
  saveSubjectEcrItem,
  getAllSubjectEcrItems,
  getSubjectEcrItemsBySubjectEcrId,
  clearSubjectEcrItemCache,
} from "./db/queries/subject_ecr_items";

// Query functions for student_ecr_item_scores
export {
  createStudentEcrItemScore,
  updateStudentEcrItemScore,
  deleteStudentEcrItemScore,
  getStudentEcrItemScore,
  saveStudentEcrItemScore,
  getAllStudentEcrItemScores,
  getStudentEcrItemScoresByStudentId,
  getStudentEcrItemScoresByItemId,
  clearStudentEcrItemScoreCache,
} from "./db/queries/student_ecr_item_scores";

// Query functions for student_running_grades
export {
  createStudentRunningGrade,
  updateStudentRunningGrade,
  upsertStudentRunningGrade,
  getStudentRunningGradesBySubjectAndQuarter,
  getStudentRunningGradesBySubjectAndClassSection,
  saveStudentRunningGrade,
  getAllStudentRunningGrades,
  getStudentRunningGradesByStudentId,
  getStudentRunningGradesBySubjectId,
  clearStudentRunningGradeCache,
} from "./db/queries/student_running_grades";

// Query functions for sync_queue
export {
  addToSyncQueue,
  getPendingSyncItems,
  getPendingCount,
  markAsSyncing,
  markAsSynced,
  markAsFailed,
  incrementRetryCount,
  clearSyncedItems,
  getFailedItems,
  resetFailedItem,
} from "./db/queries/sync_queue";

// Query functions for sync_log
export {
  createSyncLog,
  updateSyncLog,
  completeSyncLog,
  failSyncLog,
  getLastSyncLog,
  getAllSyncLogs,
  clearOldSyncLogs,
} from "./db/queries/sync_log";

// Clear functions for sync tables
export {
  clearSyncQueue,
  clearSyncLog,
  clearAllSyncData,
} from "./db/queries/sync_clear";

// Database utilities
export { getDatabasePath, checkTableExists, getAllTables } from "./db/utils";

