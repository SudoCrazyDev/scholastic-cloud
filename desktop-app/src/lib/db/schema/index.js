import { initUserTable } from "./users";
import { initInstitutionTable } from "./institutions";
import { initClassSectionTable } from "./class_sections";
import { initSubjectTable } from "./subjects";
import { initStudentTable } from "./students";
import { initStudentSectionTable } from "./student_sections";
import { initSubjectEcrTable } from "./subjects_ecr";
import { initSubjectEcrItemTable } from "./subject_ecr_items";
import { initStudentEcrItemScoreTable } from "./student_ecr_item_scores";
import { initStudentRunningGradeTable } from "./student_running_grades";
import { initSyncQueueTable } from "./sync_queue";
import { initSyncLogTable } from "./sync_log";

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
  await initStudentTable();
  await initStudentSectionTable();
  await initSubjectEcrTable();
  await initSubjectEcrItemTable();
  await initStudentEcrItemScoreTable();
  await initStudentRunningGradeTable();

  // Sync tables
  await initSyncQueueTable();
  await initSyncLogTable();
}

