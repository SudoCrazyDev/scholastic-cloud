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

// Database utilities
export { getDatabasePath, checkTableExists, getAllTables } from "./db/utils";

