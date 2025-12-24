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
  saveStudentEcrItemScore,
  getAllStudentEcrItemScores,
  getStudentEcrItemScoresByStudentId,
  clearStudentEcrItemScoreCache,
} from "./db/queries/student_ecr_item_scores";

// Query functions for student_running_grades
export {
  saveStudentRunningGrade,
  getAllStudentRunningGrades,
  getStudentRunningGradesByStudentId,
  getStudentRunningGradesBySubjectId,
  clearStudentRunningGradeCache,
} from "./db/queries/student_running_grades";

// Database utilities
export { getDatabasePath, checkTableExists, getAllTables } from "./db/utils";

