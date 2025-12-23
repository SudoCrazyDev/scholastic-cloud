import { initUserTable } from "./users";
import { initInstitutionTable } from "./institutions";
import { initClassSectionTable } from "./class_sections";
import { initSubjectTable } from "./subjects";

/**
 * Initialize all database tables needed for the app.
 *
 * As we add more tables (institutions, roles, class_sections, etc.),
 * just import their init functions and add them to this list.
 */
export async function initDatabaseSchema() {
  // Order matters if there are foreign-key dependencies.
  await initUserTable();
  await initInstitutionTable();
  await initClassSectionTable();
  await initSubjectTable();
}


