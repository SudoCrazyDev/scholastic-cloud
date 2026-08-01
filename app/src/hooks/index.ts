// TanStack Query hooks
export { useClassSections } from './useClassSections'
export { useSubjects, useSubjectDetail } from './useSubjects'
export { useSubscriptions } from './useSubscriptions'
export { useUsers } from './useUsers'
export { useInstitutions } from './useInstitutions'
export { useRoles } from './useRoles'
export { useStaffs } from './useStaffs'
export { useMyClassSections } from './useMyClassSections'
export { useAssignedSubjects } from './useAssignedSubjects'
export * from './useSubjectEcrItems';
export { useStudentScores } from './useStudentScores';
export * from './useStudentRunningGrades';
export { useStudentReportCard } from './useStudentReportCard';
export { useInstitutionLogo } from './useInstitutionLogo';
export {
  useGradingPeriods,
  useGradingPeriodsForYear,
  buildGradingPeriodConfig,
} from './useGradingPeriods';
export type { UseGradingPeriodsResult } from './useGradingPeriods';

// Generic data table hook
export { useDataTable } from './useDataTable'

// Example implementation
export { useSubscriptionsWithDataTable } from './useSubscriptionsWithDataTable'

// Module access
export { usePermissions } from './usePermissions'
export { useModuleCatalog } from './useModuleCatalog'

// Legacy hooks (for backward compatibility)
export { useAuth } from './useAuth'
export { useLogin, useLogout, useProfile } from './useAuthQueries' 