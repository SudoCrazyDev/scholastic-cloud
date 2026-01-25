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

// Finance types
export interface SchoolFee {
  id: string;
  institution_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSchoolFeeData {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateSchoolFeeData {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface SchoolFeeDefault {
  id: string;
  school_fee_id: string;
  institution_id: string;
  grade_level: string;
  academic_year: string;
  amount: number;
  school_fee?: SchoolFee;
  created_at: string;
  updated_at: string;
}

export interface CreateSchoolFeeDefaultData {
  school_fee_id: string;
  grade_level: string;
  academic_year: string;
  amount: number;
}

export interface UpdateSchoolFeeDefaultData {
  grade_level?: string;
  academic_year?: string;
  amount?: number;
}

export interface BulkSchoolFeeDefaultData {
  grade_level: string;
  academic_year: string;
  defaults: Array<{
    school_fee_id: string;
    amount: number;
  }>;
}

export interface StudentPayment {
  id: string;
  institution_id: string;
  student_id: string;
  school_fee_id?: string | null;
  academic_year: string;
  amount: number;
  payment_date: string;
  payment_method?: string | null;
  reference_number?: string | null;
  receipt_number?: string | null;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
  school_fee?: SchoolFee;
  student?: Student;
}

export interface CreateStudentPaymentData {
  student_id: string;
  academic_year: string;
  amount: number;
  payment_date?: string;
  payment_method?: string;
  reference_number?: string;
  remarks?: string;
  school_fee_id?: string;
}

export interface StudentDiscount {
  id: string;
  institution_id: string;
  student_id: string;
  school_fee_id?: string | null;
  academic_year: string;
  discount_type: 'fixed' | 'percentage';
  value: number;
  description?: string | null;
  created_at: string;
  updated_at: string;
  school_fee?: SchoolFee;
}

export interface CreateStudentDiscountData {
  student_id: string;
  academic_year: string;
  discount_type: 'fixed' | 'percentage';
  value: number;
  school_fee_id?: string;
  description?: string;
}

export interface StudentLedgerEntry {
  type: 'balance_forward' | 'charge' | 'discount' | 'payment';
  description: string;
  amount: number;
  date?: string | null;
  fee_id?: string;
  fee_name?: string;
  receipt_number?: string;
  reference_number?: string;
  payment_id?: string;
  discount_id?: string;
  discount_type?: 'fixed' | 'percentage';
  discount_value?: number;
  running_balance?: number;
}

export interface StudentLedgerResponse {
  student: Student;
  academic_year: string;
  grade_level?: string;
  entries: StudentLedgerEntry[];
  totals: {
    charges: number;
    discounts: number;
    payments: number;
    balance_forward: number;
    balance: number;
  };
  available_academic_years?: string[];
}

export interface StudentNOAResponse {
  student: Student;
  academic_year: string;
  grade_level?: string;
  fees: Array<{
    fee_id: string;
    fee_name: string;
    amount: number;
  }>;
  discounts?: Array<{
    discount_id: string;
    discount_type: 'fixed' | 'percentage';
    discount_value: number;
    amount: number;
    description?: string | null;
    fee_id?: string | null;
    fee_name?: string | null;
    created_at?: string | null;
  }>;
  payments: Array<{
    payment_id: string;
    amount: number;
    payment_date?: string | null;
    receipt_number?: string | null;
    reference_number?: string | null;
    fee_name?: string | null;
  }>;
  totals: {
    charges: number;
    discounts: number;
    payments: number;
    balance_forward: number;
    balance: number;
  };
  available_academic_years?: string[];
}

export interface StudentReceipt {
  payment: StudentPayment;
  student: Student;
  institution?: Institution;
  received_by?: User;
}

export interface FinanceDashboardFee {
  id: string;
  name: string;
}

export interface FinanceGradeSummary {
  grade_level: string;
  student_count: number;
  payable: {
    total: number;
    by_fee: Record<string, number>;
    balance_forward: number;
    discounts: number;
  };
  payments: {
    total: number;
    by_fee: Record<string, number>;
    unassigned: number;
  };
}

export interface FinanceDashboardSummary {
  academic_year: string;
  fees: FinanceDashboardFee[];
  grades: FinanceGradeSummary[];
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
  logo?: string | File;
  subscription_id?: string;
}

export interface UpdateInstitutionData {
  title?: string;
  abbr?: string;
  address?: string;
  division?: string;
  region?: string;
  gov_id?: string;
  logo?: string | File;
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

// Subject Template types
export interface SubjectTemplate {
  id: string;
  institution_id: string;
  name: string;
  description?: string;
  grade_level?: string;
  created_by: string;
  creator?: User;
  items?: SubjectTemplateItem[];
  created_at: string;
  updated_at: string;
}

export interface SubjectTemplateItem {
  id: string;
  template_id: string;
  subject_type: 'parent' | 'child';
  parent_item_id?: string;
  parent_item?: SubjectTemplateItem;
  child_items?: SubjectTemplateItem[];
  title: string;
  variant?: string;
  start_time?: string;
  end_time?: string;
  is_limited_student: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSubjectTemplateData {
  name: string;
  description?: string;
  grade_level?: string;
  items: CreateSubjectTemplateItemData[];
}

export interface CreateSubjectTemplateItemData {
  subject_type: 'parent' | 'child';
  parent_item_index?: number; // Index reference for parent item
  title: string;
  variant?: string;
  start_time?: string;
  end_time?: string;
  is_limited_student?: boolean;
  order?: number;
}

export interface UpdateSubjectTemplateData {
  name?: string;
  description?: string;
  grade_level?: string;
  items?: UpdateSubjectTemplateItemData[];
}

export interface UpdateSubjectTemplateItemData {
  id?: string; // Existing item ID
  subject_type: 'parent' | 'child';
  parent_item_index?: number;
  title: string;
  variant?: string;
  start_time?: string;
  end_time?: string;
  is_limited_student?: boolean;
  order?: number;
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

export interface SubjectQuarterPlan {
  id: string;
  subject_id: string;
  quarter: string; // '1' | '2' | '3' | '4'
  start_date: string; // YYYY-MM-DD
  exam_date: string; // YYYY-MM-DD
  meeting_days?: string[] | null; // e.g. ['monday','wednesday']
  excluded_dates?: string[] | null; // YYYY-MM-DD
  quizzes_count: number;
  assignments_count: number;
  activities_count: number;
  projects_count: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonPlan {
  id: string;
  subject_id: string;
  subject_quarter_plan_id?: string | null;
  topic_id?: string | null;
  quarter: string;
  lesson_date: string; // YYYY-MM-DD
  title?: string | null;
  content?: unknown;
  generated_by?: string | null;
  generated_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
  topic?: Topic;
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
  student_section_id: string;
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
  profile_picture?: string | File;
  is_active?: boolean;
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
  profile_picture?: string | File;
  is_active?: boolean;
}

// Student Attendance types
export interface StudentAttendance {
  id: string;
  student_id: string;
  class_section_id: string;
  academic_year: string;
  month: number; // 1-12
  year: number; // e.g., 2025
  days_present: number;
  days_absent: number;
  created_at: string;
  updated_at: string;
  student?: Student;
  class_section?: ClassSection;
}

export interface CreateStudentAttendanceData {
  student_id: string;
  class_section_id: string;
  academic_year: string;
  month: number; // 1-12
  year: number; // e.g., 2025
  days_present: number;
  days_absent: number;
}

export interface UpdateStudentAttendanceData {
  days_present?: number;
  days_absent?: number;
}

export interface BulkUpsertStudentAttendanceData {
  class_section_id: string;
  academic_year: string;
  month: number;
  year: number;
  attendances: Array<{
    student_id: string;
    days_present: number;
    days_absent: number;
  }>;
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

// School Days types
export interface SchoolDay {
  id: string;
  institution_id: string;
  academic_year: string;
  month: number; // 1-12
  year: number; // e.g., 2025
  total_days: number;
  created_at: string;
  updated_at: string;
  institution?: Institution;
}

export interface CreateSchoolDayData {
  institution_id: string;
  academic_year: string;
  month: number; // 1-12
  year: number; // e.g., 2025
  total_days: number;
}

export interface UpdateSchoolDayData {
  total_days?: number;
}

export interface BulkUpsertSchoolDayData {
  institution_id: string;
  academic_year: string;
  year: number;
  school_days: Array<{
    month: number;
    total_days: number;
  }>;
} 