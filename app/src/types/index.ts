// Common types used across the application
export interface User {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender: 'male' | 'female' | 'other';
  birthdate: string;
  email: string;
  email_verified_at?: string;
  is_new: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role?: Role;
  user_institutions?: UserInstitution[];
}

export interface Role {
  id: string;
  title: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface FormFieldError {
  field: string;
  message: string;
}

export interface ValidationErrors {
  [key: string]: string[];
}

// Role types
export interface CreateRoleData {
  title: string;
  slug: string;
}

export interface UpdateRoleData {
  title?: string;
  slug?: string;
}

// Subscription types
export interface Subscription {
  id: string;
  title: string;
  description?: string;
  price: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSubscriptionData {
  title: string;
  description?: string;
  price: number;
}

export interface UpdateSubscriptionData {
  title?: string;
  description?: string;
  price?: number;
}

// Institution types
export interface Institution {
  id: string;
  title: string;
  abbr: string;
  address?: string;
  division?: string;
  region?: string;
  gov_id?: string;
  logo?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInstitutionData {
  title: string;
  abbr: string;
  address?: string;
  division?: string;
  region?: string;
  gov_id?: string;
  logo?: string;
  subscription_id?: string;
}

export interface UpdateInstitutionData {
  title?: string;
  abbr?: string;
  address?: string;
  division?: string;
  region?: string;
  gov_id?: string;
  logo?: string;
  subscription_id?: string;
}

// User types
export interface CreateUserData {
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender: 'male' | 'female' | 'other';
  birthdate: string;
  email: string;
  password: string;
  role_id?: string;
  institution_ids?: string[];
}

export interface UpdateUserData {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  ext_name?: string;
  gender?: 'male' | 'female' | 'other';
  birthdate?: string;
  email?: string;
  password?: string;
  role_id?: string;
  institution_ids?: string[];
  is_new?: boolean;
  is_active?: boolean;
}

// Class Section types
export interface ClassSection {
  id: string;
  institution_id: string;
  grade_level: string;
  title: string;
  adviser?: User;
  academic_year?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateClassSectionData {
  grade_level: string;
  title: string;
  adviser?: string;
  academic_year?: string;
}

export interface UpdateClassSectionData {
  grade_level?: string;
  title?: string;
  adviser?: string;
  academic_year?: string;
}

// Subject types
export interface Subject {
  id: string;
  institution_id: string;
  class_section_id: string;
  adviser?: string; // User ID of the subject teacher
  adviser_user?: User; // Full user object
  subject_type: 'parent' | 'child';
  parent_subject_id?: string; // Reference to parent subject
  parent_subject?: Subject; // Full parent subject object
  title: string;
  variant?: string; // Optional variant (e.g., "Sewing", "Machineries", "Plumbing")
  start_time?: string;
  end_time?: string;
  is_limited_student?: boolean;
  order: number; // Order for sorting subjects
  created_at: string;
  updated_at: string;
  child_subjects?: Subject[]; // For nested display
  class_section?: ClassSection;
  institution?: Institution;
}

// Assigned Subject types (for user's assigned subjects)
export interface AssignedSubject extends Subject {
  class_section: ClassSection;
  institution: Institution;
  student_count?: number;
  total_students?: number;
}

// Subject Detail types
export interface ClassRecord {
  id: string;
  subject_id: string;
  title: string;
  description?: string;
  date: string;
  type: 'quiz' | 'assignment' | 'exam' | 'project' | 'other';
  total_score: number;
  passing_score: number;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  subject_id: string;
  title: string;
  description?: string;
  order: number;
  is_completed: boolean;
  quarter?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTopicData {
  subject_id: string;
  title: string;
  description?: string;
  is_completed?: boolean;
  quarter?: string;
}

export interface UpdateTopicData {
  title?: string;
  description?: string;
  is_completed?: boolean;
  quarter?: string;
}

// Report Card types
export interface SectionSubject {
  id: string;
  name?: string;
  subject_name?: string;
  variant?: string;
  title: string;
  order: number;
  subject_type: 'parent' | 'child';
  parent_subject_id?: string;
}

export interface StudentSubjectGrade {
  id?: string;
  subject_id: string;
  student_id: string;
  quarter1_grade?: number | string;
  quarter2_grade?: number | string;
  quarter3_grade?: number | string;
  quarter4_grade?: number | string;
  final_grade?: number | string;
  remarks?: string;
  academic_year?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReorderTopicsData {
  subject_id: string;
  topic_orders: Array<{
    id: string;
    order: number;
  }>;
}

export interface CalendarEvent {
  id: string;
  subject_id: string;
  title: string;
  description?: string;
  event_date: string;
  event_type: 'exam' | 'assignment_due' | 'project_due' | 'holiday' | 'other';
  is_all_day: boolean;
  start_time?: string;
  end_time?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSubjectData {
  institution_id: string;
  class_section_id: string;
  adviser?: string; // User ID of the subject teacher
  subject_type: 'parent' | 'child';
  parent_subject_id?: string;
  title: string;
  variant?: string;
  start_time?: string;
  end_time?: string;
  is_limited_student?: boolean;
}

export interface UpdateSubjectData {
  institution_id?: string;
  class_section_id?: string;
  adviser?: string;
  subject_type?: 'parent' | 'child';
  parent_subject_id?: string;
  title?: string;
  variant?: string;
  start_time?: string;
  end_time?: string;
  is_limited_student?: boolean;
}

export interface ReorderSubjectsData {
  class_section_id: string;
  subject_orders: Array<{
    id: string;
    order: number;
  }>;
}

// Legacy types for backward compatibility (deprecated)
export interface ClassSectionSubject {
  id: string;
  class_section_id: string;
  title: string;
  variant?: string;
  start_time: string;
  end_time: string;
  subject_teacher?: string;
  parent_id?: string;
  order: number;
  created_at: string;
  updated_at: string;
  children?: ClassSectionSubject[];
}

export interface CreateClassSectionSubjectData {
  class_section_id: string;
  title: string;
  variant?: string;
  start_time: string;
  end_time: string;
  subject_teacher?: string;
  parent_id?: string;
  order?: number;
}

export interface UpdateClassSectionSubjectData {
  title?: string;
  variant?: string;
  start_time?: string;
  end_time?: string;
  subject_teacher?: string;
  parent_id?: string;
  order?: number;
}

// Student types
export interface Student {
  id: string;
  lrn?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender?: string;
  religion?: string;
  birthdate: string;
  profile_picture?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateStudentData {
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  birthdate: string;
  gender: 'male' | 'female' | 'other';
  religion: 'Islam' | 'Catholic' | 'Iglesia Ni Cristo' | 'Baptists' | 'Others';
  lrn: string;
  profile_picture?: string;
}

export interface UpdateStudentData {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  ext_name?: string;
  birthdate?: string;
  gender?: 'male' | 'female' | 'other';
  religion?: 'Islam' | 'Catholic' | 'Iglesia Ni Cristo' | 'Baptists' | 'Others';
  lrn?: string;
  profile_picture?: string;
}

// Staff types
export interface CreateStaffData {
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender: 'male' | 'female' | 'other';
  birthdate: string;
  email: string;
  password: string;
  role_id: string;
}

export interface UpdateStaffData {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  ext_name?: string;
  gender?: 'male' | 'female' | 'other';
  birthdate?: string;
  email?: string;
  password?: string;
  role_id?: string;
}

export interface UpdateStaffRoleData {
  role_id: string;
}

// User Institution types
export interface UserInstitution {
  id: string;
  user_id: string;
  institution_id: string;
  role_id: string;
  is_default: boolean;
  is_main: boolean;
  created_at: string;
  updated_at: string;
  role?: Role;
  institution?: Institution;
}

// Teacher Attendance types
export interface TeacherAttendance {
  id: string;
  user_id: string;
  institution_id: string;
  date: string;
  check_in_time?: string;
  check_out_time?: string;
  break_out_time?: string;
  break_in_time?: string;
  status: 'present' | 'absent' | 'late' | 'on_break' | 'checked_out' | 'no_scan';
  total_hours?: number;
  created_at: string;
  updated_at: string;
  user?: User;
  institution?: Institution;
}

export interface CreateAttendanceData {
  user_id: string;
  institution_id: string;
  date: string;
  check_in_time?: string;
  check_out_time?: string;
  break_out_time?: string;
  break_in_time?: string;
  status: 'present' | 'absent' | 'late' | 'on_break' | 'checked_out';
}

export interface UpdateAttendanceData {
  check_in_time?: string;
  check_out_time?: string;
  break_out_time?: string;
  break_in_time?: string;
  status?: 'present' | 'absent' | 'late' | 'on_break' | 'checked_out';
}

export interface AttendanceStats {
  total_teachers: number;
  present_today: number;
  absent_today: number;
  late_today: number;
  on_break: number;
  checked_out: number;
  no_scan_yet: number;
}

export interface TeacherAttendanceSummary {
  user: User;
  today_attendance?: TeacherAttendance;
  last_attendance?: TeacherAttendance;
  status: 'present' | 'absent' | 'late' | 'on_break' | 'checked_out' | 'no_scan';
  check_in_time?: string;
  check_out_time?: string;
  break_out_time?: string;
  break_in_time?: string;
  total_hours?: number;
} 