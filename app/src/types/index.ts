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

export interface GradeLevel {
  id: string;
  title: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateGradeLevelData {
  title: string;
  sort_order?: number;
}

export interface UpdateGradeLevelData {
  title?: string;
  sort_order?: number;
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

export interface DefaultDiscount {
  id: string;
  institution_id: string;
  name: string;
  discount_type: 'fixed' | 'percentage';
  value: number;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDefaultDiscountData {
  name: string;
  discount_type: 'fixed' | 'percentage';
  value: number;
  description?: string;
  is_active?: boolean;
}

export interface UpdateDefaultDiscountData {
  name?: string;
  discount_type?: 'fixed' | 'percentage';
  value?: number;
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

export interface ApplyAllSchoolFeeDefaultData {
  school_fee_id: string;
  academic_year: string;
  amount: number;
  grade_levels: string[];
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
  or_number?: string | null;
  receipt_number?: string | null;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
  school_fee?: SchoolFee;
  student?: Student;
}

export interface PaymentTransaction {
  id: string;
  institution_id: string;
  student_id: string;
  academic_year: string;
  payment_date: string;
  payment_method?: string | null;
  reference_number?: string | null;
  or_number?: string | null;
  receipt_number: string;
  remarks?: string | null;
  total_amount: number;
  amount_tendered?: number | null;
  change_due?: number | null;
  received_by?: string | null;
  created_at: string;
  updated_at: string;
  items?: StudentPayment[];
  student?: Student;
}

export interface CreatePaymentTransactionItem {
  school_fee_id?: string | null;
  amount: number;
  remarks?: string;
}

export interface CreatePaymentTransactionData {
  student_id: string;
  academic_year: string;
  payment_date?: string;
  payment_method?: string;
  reference_number?: string;
  or_number?: string;
  remarks?: string;
  amount_tendered?: number;
  items: CreatePaymentTransactionItem[];
}

export interface TransactionReceipt {
  transaction: PaymentTransaction;
  student: Student;
  institution?: Institution;
  received_by?: User;
}

export interface StudentOnlinePaymentTransaction {
  id: string;
  institution_id: string;
  student_id: string;
  school_fee_id?: string | null;
  completed_payment_id?: string | null;
  created_by?: string | null;
  provider: string;
  status: 'pending' | 'authorized' | 'completed' | 'failed' | 'expired' | 'cancelled';
  academic_year: string;
  amount: number;
  currency: string;
  request_reference_number: string;
  provider_payment_id?: string | null;
  provider_charge_id?: string | null;
  checkout_url?: string | null;
  expires_at?: string | null;
  paid_at?: string | null;
  failure_reason?: string | null;
  provider_payload?: Record<string, any> | null;
  provider_response?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  school_fee?: SchoolFee;
  completed_payment?: StudentPayment;
  redirect_url?: string;
}

export interface CreateStudentOnlinePaymentCheckoutData {
  student_id?: string;
  academic_year: string;
  amount: number;
  currency?: string;
  school_fee_id?: string;
  item_name?: string;
  item_description?: string;
  original_amount?: number;
  discount_amount?: number;
  redirect_url: {
    success: string;
    failure: string;
    cancel: string;
  };
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
  voided_at?: string | null;
  voided_by?: string | null;
  void_note?: string | null;
}

export interface CreateStudentDiscountData {
  student_id: string;
  academic_year: string;
  discount_type: 'fixed' | 'percentage';
  value: number;
  school_fee_id?: string;
  description?: string;
  allocations?: { school_fee_id?: string; value: number }[];
}

export interface StudentLedgerEntry {
  type: 'balance_forward' | 'charge' | 'discount' | 'payment';
  description: string;
  amount: number;
  date?: string | null;
  fee_id?: string;
  fee_name?: string;
  or_number?: string | null;
  receipt_number?: string;
  reference_number?: string;
  payment_id?: string;
  discount_id?: string;
  discount_type?: 'fixed' | 'percentage';
  discount_value?: number;
  discount_scope?: 'student' | 'grade_level';
  running_balance?: number;
  processed_by?: string | null;
  voided?: boolean;
  voided_at?: string | null;
  voided_by?: string | null;
  void_note?: string | null;
}

export type PaymentVoidStatus = 'pending' | 'approved' | 'disapproved';

export interface PaymentVoidRequest {
  id: string;
  institution_id: string;
  student_id: string;
  academic_year: string;
  receipt_number: string;
  payment_transaction_id?: string | null;
  target_payment_id?: string | null;
  amount: number | string;
  status: PaymentVoidStatus;
  request_note: string;
  review_note?: string | null;
  requested_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  student?: { id: string; first_name: string; middle_name?: string | null; last_name: string };
  requester?: { id: string; first_name: string; last_name: string } | null;
  reviewer?: { id: string; first_name: string; last_name: string } | null;
}

// Legacy enum kept for back-compat; plans are now identified by payment_plan_id + name.
export type StudentPaymentPlanType = 'monthly' | 'quarterly';

export interface StudentPaymentPlan {
  id: string;
  academic_year: string;
  payment_plan_id?: string | null;
  name?: string | null;
  plan_type?: StudentPaymentPlanType | null;
  installment_count: number;
  selected_at?: string | null;
  selected_by_student: boolean;
}

// Admin-managed payment plan definitions (Finance > Payment Plans module).
export interface PaymentPlanInstallmentTemplate {
  id?: string;
  sequence: number;
  label?: string | null;
  due_month: number; // 1-12
  due_day: number; // 1-31
  grace_period_days?: number; // days after the due date before an overdue charge applies
  late_fee_percentage?: number; // % of the installment charged once overdue
  share_percentage?: number | null;
}

export interface PaymentPlan {
  id: string;
  institution_id?: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  installment_count: number;
  installments: PaymentPlanInstallmentTemplate[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreatePaymentPlanData {
  name: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
  installments: Array<Omit<PaymentPlanInstallmentTemplate, 'id' | 'sequence'> & { sequence?: number }>;
}

export interface PaymentPlanChange {
  id: string;
  student_id: string;
  academic_year: string;
  payment_plan_id?: string | null;
  plan_name?: string | null;
  previous_payment_plan_id?: string | null;
  previous_plan_name?: string | null;
  changed_at?: string | null;
  changed_by?: string | null;
  changed_by_name?: string | null;
  changed_by_student: boolean;
  note?: string | null;
}

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface StaffScheduleDay {
  id?: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM"
  grace_minutes?: number; // minutes after start_time before a punch-in counts as late
  end_time: string; // "HH:MM"
  lunch_start?: string | null; // "HH:MM"
  lunch_end?: string | null; // "HH:MM"
}

// A schedule is a reusable template (name + description + weekly hours).
export interface StaffSchedule {
  id: string;
  institution_id?: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  assigned_count: number;
  day_count: number;
  days: StaffScheduleDay[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreateStaffScheduleData {
  name: string;
  description?: string | null;
  is_active?: boolean;
  days: StaffScheduleDay[];
}

// Assigning a schedule template to staff.
export interface StaffScheduleAssignment {
  id: string;
  user_id: string;
  staff_name?: string | null;
  staff_email?: string | null;
  staff_schedule_id: string;
  schedule_name?: string | null;
  created_at?: string | null;
}

export interface AssignStaffScheduleData {
  user_ids: string[];
}

export interface AssignStaffScheduleResult {
  created: number;
  reassigned: number;
  total: number;
}

// Calendar — holidays & events
export type CalendarEventType = 'holiday' | 'event';

export interface StaffCalendarEvent {
  id: string;
  institution_id?: string;
  title: string;
  description?: string | null;
  type: CalendarEventType;
  event_date: string; // YYYY-MM-DD
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreateStaffCalendarEventData {
  title: string;
  description?: string | null;
  type: CalendarEventType;
  event_date: string;
}

export interface StudentInstallment {
  sequence: number;
  label: string;
  due_date: string;
  grace_period_days: number;
  overdue_date: string;
  is_overdue: boolean;
  late_fee_percentage: number;
  late_fee_amount: number;
  amount: number;
  original_amount: number;
  discount_amount: number;
  paid_amount: number;
  status: 'paid' | 'partial' | 'pending';
}

export interface LedgerFeeBreakdown {
  fee_id: string;
  fee_name: string;
  is_additional: boolean;
  charge: number;
  discount: number;
  paid: number;
  outstanding: number;
}

export interface StudentLedgerResponse {
  student: Student;
  academic_year: string;
  grade_level?: string;
  section?: string;
  entries: StudentLedgerEntry[];
  totals: {
    charges: number;
    discounts: number;
    payments: number;
    balance_forward: number;
    balance: number;
  };
  fee_breakdown?: LedgerFeeBreakdown[];
  unallocated_payments?: number;
  payment_plan?: StudentPaymentPlan | null;
  installments?: StudentInstallment[];
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
  payment_plan?: StudentPaymentPlan | null;
  installments?: StudentInstallment[];
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

// Grade-level discount types
export interface GradeLevelDiscount {
  id: string;
  institution_id: string;
  school_fee_id?: string | null;
  grade_level: string;
  academic_year: string;
  discount_type: 'fixed' | 'percentage';
  value: number;
  description?: string | null;
  created_at: string;
  updated_at: string;
  school_fee?: SchoolFee;
}

export interface CreateGradeLevelDiscountData {
  grade_level: string;
  academic_year: string;
  discount_type: 'fixed' | 'percentage';
  value: number;
  school_fee_id?: string;
  description?: string;
}

// Student additional fee types
export interface StudentAdditionalFee {
  id: string;
  institution_id: string;
  student_id: string;
  academic_year: string;
  name: string;
  description?: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface CreateStudentAdditionalFeeData {
  student_id: string;
  academic_year: string;
  name: string;
  description?: string;
  amount: number;
}

// Receipt template types
export interface ReceiptTemplateElement {
  id: string;
  type: 'institution_name' | 'institution_address' | 'institution_logo' | 'student_name' | 'student_lrn' | 'grade_level' | 'receipt_number' | 'payment_date' | 'payment_amount' | 'payment_method' | 'fee_name' | 'academic_year' | 'received_by' | 'divider' | 'custom_text' | 'signature_line' | 'spacer';
  label: string;
  content?: string;
  style?: Record<string, string>;
}

export interface ReceiptTemplate {
  id: string;
  institution_id: string;
  name: string;
  is_default: boolean;
  paper_size: string;
  layout: ReceiptTemplateElement[];
  created_at: string;
  updated_at: string;
}

export interface CreateReceiptTemplateData {
  name: string;
  is_default?: boolean;
  paper_size?: string;
  layout: ReceiptTemplateElement[];
}

// Finance collection types
export interface MonthlyCollection {
  month: number;
  year: number;
  label: string;
  total: number;
  count: number;
  by_method: Record<string, number>;
}

export interface QuarterlyCollection {
  label: string;
  total: number;
  count: number;
  by_method: Record<string, number>;
}

export interface FinanceCollectionsResponse {
  academic_year: string;
  grand_total: number;
  monthly: MonthlyCollection[];
  quarterly: QuarterlyCollection[];
}

// Department types
export interface Department {
  id: string;
  institution_id: string;
  title: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDepartmentData {
  title: string;
  slug?: string;
}

export interface UpdateDepartmentData {
  title?: string;
  slug?: string;
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
  default_department_id?: string | null;
  default_department?: Department | null;
  current_academic_year?: string | null;
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
  default_department_id?: string | null;
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

// Track & Strand types (SHS)
export interface Track {
  id: string;
  institution_id: string;
  title: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface Strand {
  id: string;
  institution_id: string;
  track_id: string;
  title: string;
  slug: string;
  track?: Track;
  created_at: string;
  updated_at: string;
}

// Class Section types
export interface ClassSection {
  id: string;
  institution_id: string;
  department_id?: string | null;
  department?: Department | null;
  track_id?: string | null;
  strand_id?: string | null;
  track?: Track | null;
  strand?: Strand | null;
  grade_level: string;
  title: string;
  adviser?: string; // raw UUID FK
  adviser_user?: User; // loaded relation
  academic_year?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateClassSectionData {
  grade_level: string;
  title: string;
  adviser?: string;
  academic_year?: string;
  department_id?: string | null;
  track_id?: string | null;
  strand_id?: string | null;
}

export interface UpdateClassSectionData {
  grade_level?: string;
  title?: string;
  adviser?: string;
  academic_year?: string;
  department_id?: string | null;
  track_id?: string | null;
  strand_id?: string | null;
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
export type GradingType = 'numerical' | 'non_numerical';

export interface GradingScaleBand {
  id?: string;
  grading_scale_id?: string;
  label: string;
  min_score: number;
  max_score: number;
  sort_order?: number;
}

export interface GradingScale {
  id: string;
  institution_id: string;
  name: string;
  description?: string | null;
  bands: GradingScaleBand[];
  created_at?: string;
  updated_at?: string;
}

export interface GradingScaleBandInput {
  label: string;
  min_score: number;
  max_score: number;
}

export interface CreateGradingScaleData {
  name: string;
  description?: string | null;
  bands: GradingScaleBandInput[];
}

export type UpdateGradingScaleData = CreateGradingScaleData;

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
  grading_type?: GradingType;
  grading_scale_id?: string | null;
  grading_scale?: GradingScale | null;
  start_time?: string;
  end_time?: string;
  meeting_days?: string[] | null; // e.g. ['monday','wednesday','friday']
  is_limited_student?: boolean;
  order: number; // Order for sorting subjects
  created_at: string;
  updated_at: string;
  child_subjects?: Subject[]; // For nested display
  class_section?: ClassSection;
  institution?: Institution;
  /** Present when fetched with ?debug=1 (e.g. impersonation debug mode) */
  student_running_grades_count?: number;
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

// ── Lesson content blocks (LMS) ─────────────────────────────────────────────
export type LessonBlockType = 'rich_text' | 'video' | 'file' | 'assessment';

export interface RichTextBlock {
  id: string;
  type: 'rich_text';
  html: string;
}

export interface VideoBlock {
  id: string;
  type: 'video';
  url: string;
  title?: string;
}

export interface FileBlock {
  id: string;
  type: 'file';
  path: string;
  url: string;
  name: string;
  mime?: string;
  size?: number;
}

export interface AssessmentBlock {
  id: string;
  type: 'assessment';
  subject_ecr_item_id: string;
  title?: string;
  assessmentType?: 'quiz' | 'activity' | 'assignment' | 'exam';
  /** Populated by the student-facing API (StudentLessonController). */
  assessment_available?: boolean;
}

export type LessonBlock = RichTextBlock | VideoBlock | FileBlock | AssessmentBlock;

export interface Topic {
  id: string;
  subject_id: string;
  title: string;
  description?: string;
  content?: LessonBlock[];
  learning_objectives?: string[];
  estimated_minutes?: number | null;
  order: number;
  is_completed: boolean;
  is_published?: boolean;
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
  grading_type?: GradingType;
  grading_scale_id?: string | null;
  start_time?: string;
  end_time?: string;
  meeting_days?: string[] | null;
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
  grading_type?: GradingType;
  grading_scale_id?: string | null;
  start_time?: string;
  end_time?: string;
  meeting_days?: string[] | null;
  is_limited_student?: boolean;
}

export interface TimetableConflict {
  teacher_id: string;
  teacher_name: string;
  shared_days: string[];
  subject_a: {
    id: string;
    title: string;
    section: string;
    start_time: string;
    end_time: string;
    meeting_days: string[];
  };
  subject_b: {
    id: string;
    title: string;
    section: string;
    start_time: string;
    end_time: string;
    meeting_days: string[];
  };
}

export interface UpdateSubjectScheduleData {
  start_time?: string | null;
  end_time?: string | null;
  meeting_days?: string[] | null;
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
  /** Title of the student's current (active) section — provided by GET /students. */
  current_section?: string | null;
  // Normalized admission records (loaded on GET /students/:id)
  profile?: StudentProfile | null;
  guardians?: StudentGuardian[];
  emergency_contacts?: StudentEmergencyContact[];
  health_record?: StudentHealthRecord | null;
}

/** Extended personal information from the admission form (1:1 with student). */
export interface StudentProfile {
  id?: string;
  student_id?: string;
  complete_address?: string | null;
  mobile_number?: string | null;
  place_of_birth?: string | null;
  mother_tongue?: string | null;
  last_school_attended?: string | null;
  school_year?: string | null;
  school_address?: string | null;
  brothers_count?: number | null;
  sisters_count?: number | null;
}

/** Family / guardian record from the admission form. */
export interface StudentGuardian {
  id?: string;
  student_id?: string;
  relation: 'father' | 'mother' | 'guardian';
  name?: string | null;
  age?: number | null;
  occupation?: string | null;
}

/** Emergency contact from the admission form. */
export interface StudentEmergencyContact {
  id?: string;
  student_id?: string;
  name?: string | null;
  address?: string | null;
  relationship?: string | null;
  age?: number | null;
  contact_number?: string | null;
}

/** Health / medical record from the admission form (1:1 with student). */
export interface StudentHealthRecord {
  id?: string;
  student_id?: string;
  had_chicken_pox: boolean;
  had_chicken_pox_note?: string | null;
  had_chicken_pox_vaccine: boolean;
  had_chicken_pox_vaccine_note?: string | null;
  hospitalization_past_year: boolean;
  hospitalization_past_year_note?: string | null;
  chronic_condition: boolean;
  chronic_condition_note?: string | null;
  allergies: boolean;
  allergies_note?: string | null;
  other_medical_problems: boolean;
  other_medical_problems_note?: string | null;
}

/** Payload for PUT /students/:id/admission-record (all sections optional). */
export interface UpdateAdmissionRecordData {
  profile?: StudentProfile;
  guardians?: StudentGuardian[];
  emergency_contacts?: StudentEmergencyContact[];
  health_record?: StudentHealthRecord;
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

export interface StudentDocument {
  id: string;
  student_id: string;
  institution_id: string;
  document_type: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by?: string;
  url?: string;
  created_at?: string;
  updated_at?: string;
}

/** Online admission form (public submit; stored as JSON payload, no finance section). */
export interface AdmissionHealthBlock {
  answer: boolean
  when?: string
  details?: string
}

export interface AdmissionFormPayload {
  grade_level: string
  general_information: {
    surname: string
    first_name: string
    middle_name?: string
    full_name?: string
    complete_address: string
    mobile_number: string
    birthdate: string
    place_of_birth?: string
    religion?: string
    gender: string
    age?: number
    mother_tongue?: string
    last_school_attended?: string
    school_year?: string
    school_address?: string
    lrn?: string
  }
  family_information: {
    father: { name?: string; age?: number; occupation?: string }
    mother: { name?: string; age?: number; occupation?: string }
    siblings: { brothers?: number; sisters?: number }
  }
  emergency_contact: {
    name: string
    address?: string
    relationship?: string
    age?: number
    contact_number: string
  }
  health_information: {
    had_chicken_pox: AdmissionHealthBlock
    had_chicken_pox_vaccine: AdmissionHealthBlock
    hospitalization_past_year: AdmissionHealthBlock
    chronic_condition: AdmissionHealthBlock
    allergies: AdmissionHealthBlock
    other_medical_problems: AdmissionHealthBlock
  }
  agreement: {
    school_policies_accepted: boolean
    privacy_read_policy: boolean
    privacy_consent_given: boolean
  }
}

export interface AdmissionFormSubmissionListItem {
  id: string
  institution_id: string
  payload: AdmissionFormPayload
  status: 'pending' | 'accepted' | 'rejected'
  student_id?: string | null
  created_at?: string
  updated_at?: string
  institution?: { id: string; title: string; abbr?: string | null; address?: string | null }
  student_match?: {
    id: string
    section: { id: string; title: string; grade_level: string; academic_year: string } | null
  } | null
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

// Student RFID Tag types
export interface StudentRfidTag {
  id: string;
  student_id: string;
  rfid_uid: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  student?: Student;
}

export interface CreateStudentRfidTagData {
  student_id: string;
  rfid_uid: string;
  is_active?: boolean;
}

export interface UpdateStudentRfidTagData {
  rfid_uid?: string;
  is_active?: boolean;
}

// RFID Scan Log types
export interface RfidScanLog {
  id: string;
  student_rfid_tag_id: string;
  student_id: string;
  institution_id: string;
  scanned_at: string;
  type: 'enter' | 'exit';
  device_name?: string;
  created_at: string;
  updated_at: string;
  student?: Student;
  student_rfid_tag?: StudentRfidTag;
  institution?: Institution;
}

export interface CreateRfidScanLogData {
  student_rfid_tag_id: string;
  student_id: string;
  institution_id: string;
  scanned_at: string;
  type: 'enter' | 'exit';
  device_name?: string;
}

export interface RfidScanRequest {
  rfid_uid: string;
  institution_id: string;
  device_name?: string;
}

export interface KioskScanRequest {
  rfid_uid: string;
  institution_id: string;
  type: 'enter' | 'exit';
  device_name?: string;
}

export interface KioskScanResponse extends RfidScanLog {
  class_section?: ClassSection;
}

// School Days types
export interface SchoolDay {
  id: string;
  institution_id: string;
  department_id?: string | null;
  department?: Department | null;
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
  department_id?: string | null;
  academic_year: string;
  school_days: Array<{
    month: number;
    total_days: number;
  }>;
}

// HRIS — Biometric / ZKTeco types

export interface BiometricDevice {
  id: string;
  institution_id: string;
  name: string;
  serial_number: string | null;
  mac_address: string | null;
  firmware_version: string | null;
  status: 'online' | 'offline' | 'unknown';
  is_paired: boolean;
  connection: 'bridge' | 'adms' | 'pending';
  last_seen_at: string | null;
  pairing_code?: string;
  pairing_code_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZkUserMapping {
  id: string;
  institution_id: string;
  device_id: string;
  device?: BiometricDevice;
  zk_user_id: string;
  zk_name: string | null;
  zk_card_no: string | null;
  zk_privilege: string | null;
  user_id: string | null;
  user?: User;
  last_synced_at: string | null;
  push_status: 'pending' | 'done' | 'failed' | null;
  push_action: 'enroll_user' | 'enroll_fingerprint' | null;
  push_error: string | null;
  push_queued_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceLog {
  id: string;
  institution_id: string;
  device_id: string;
  device?: BiometricDevice;
  zk_user_id: string;
  user_id: string | null;
  user?: User;
  punched_at: string;
  punch_type: 'check_in' | 'check_out' | 'break_out' | 'break_in' | 'ot_in' | 'ot_out' | 'unknown';
  punch_type_code: number;
  verify_type: 'fingerprint' | 'card' | 'face' | 'password' | 'unknown';
  created_at: string;
  updated_at: string;
}

// ===================== Announcements =====================

export type AnnouncementAudience = 'students' | 'teachers' | 'both';
export type AnnouncementScope = 'institution' | 'grade_levels' | 'sections';
export type AnnouncementStatus = 'draft' | 'published';
// Which authoring surface owns the post. 'finance' posts (Finance > Announcements)
// are always audience=students + scope=institution, enforced server-side.
export type AnnouncementCategory = 'general' | 'finance';

export interface AnnouncementAttachment {
  id: string;
  name: string;
  mime: string | null;
  size: number | null;
  url: string | null;
}

export interface AnnouncementSectionRef {
  id: string;
  title: string;
  grade_level: string | null;
}

// Full shape returned to authors (teachers/admins) on the manage view.
export interface Announcement {
  id: string;
  institution_id: string;
  title: string;
  body: string | null;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  scope: AnnouncementScope;
  is_pinned: boolean;
  status: AnnouncementStatus;
  publish_at: string | null;
  expires_at: string | null;
  author_id: string | null;
  author_role: string | null;
  author_name: string;
  read_count: number;
  section_ids: string[];
  sections: AnnouncementSectionRef[];
  grade_levels: string[];
  attachments: AnnouncementAttachment[];
  created_at: string;
  updated_at: string;
}

// Trimmed shape returned to viewers (students/staff) on the board feed.
export interface AnnouncementFeedItem {
  id: string;
  title: string;
  body: string | null;
  is_pinned: boolean;
  audience: AnnouncementAudience;
  author_role: string | null;
  author_name: string;
  is_read: boolean;
  publish_at: string | null;
  attachments: AnnouncementAttachment[];
  created_at: string;
}

export interface CreateAnnouncementData {
  title: string;
  body?: string | null;
  category?: AnnouncementCategory;
  audience: AnnouncementAudience;
  scope: AnnouncementScope;
  is_pinned?: boolean;
  status?: AnnouncementStatus;
  publish_at?: string | null;
  expires_at?: string | null;
  section_ids?: string[];
  grade_levels?: string[];
}

// =====================
// Payroll (HRIS)
// =====================

// Institution-defined deduction catalog entry (SSS, Pag-IBIG, Cash Advance, ...).
export interface PayrollDeductionType {
  id: string;
  name: string;
  default_amount: number;
  has_employer_share: boolean;
  default_employer_amount: number;
  is_active: boolean;
  sort_order: number;
  updated_at?: string;
}

export interface SavePayrollDeductionTypeData {
  name: string;
  default_amount?: number;
  has_employer_share?: boolean;
  default_employer_amount?: number;
  is_active?: boolean;
}

// A staff member's default amounts for one deduction type.
export interface PayrollCompensationDeduction {
  deduction_type_id: string;
  name: string | null;
  amount: number;
  employer_amount: number;
}

export interface PayrollCompensation {
  id: string;
  user_id: string;
  designation: string | null;
  daily_rate: number;
  hourly_rate: number | null;
  effective_hourly_rate: number;
  hours_per_day: number;
  // null = inherit the institution default; a value overrides; 0 = OT off for this staff.
  overtime_rate_per_minute: number | null;
  effective_overtime_rate: number;
  deductions: PayrollCompensationDeduction[];
  deductions_total: number;
  employer_share_total: number;
  updated_at?: string;
}

// One row of the Employee Rates tab: a staff member + their (possibly unset) rates.
export interface PayrollStaffCompensation {
  user_id: string;
  staff_name: string;
  email: string;
  role_title: string | null;
  default_overtime_rate: number; // institution default, shown when a staff has no override
  compensation: PayrollCompensation | null;
}

export interface SavePayrollCompensationData {
  designation?: string | null;
  daily_rate: number;
  hourly_rate?: number | null;
  hours_per_day: number;
  overtime_rate_per_minute?: number | null;
  deductions?: { deduction_type_id: string; amount: number; employer_amount?: number }[];
}

export type PayrollPeriodStatus = 'draft' | 'finalized';

export interface PayrollPeriod {
  id: string;
  institution_id: string;
  name: string;
  date_from: string;
  date_to: string;
  status: PayrollPeriodStatus;
  paid_on: string | null;
  payslip_count: number;
  gross_total: number;
  net_total: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreatePayrollPeriodData {
  name: string;
  date_from: string;
  date_to: string;
}

// Institution-wide penalty/overtime rates (₱ per minute), snapshotted onto
// payslips at generation time. Penalty rates both 0 = penalties disabled
// (hours-based pay). Overtime pays only manager-approved minutes; 0 = off.
export interface PayrollSettings {
  late_penalty_per_minute: number;
  undertime_penalty_per_minute: number;
  overtime_rate_per_minute: number;
}

export interface PayslipSummary {
  id: string;
  user_id: string;
  staff_name: string;
  designation: string | null;
  daily_rate: number;
  days_worked: number;
  hours_worked: number;
  late_minutes: number;
  undertime_minutes: number;
  penalty_total: number;
  overtime_minutes: number;
  overtime_total: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
}

export interface PayslipDay {
  id: string;
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  required_hours: number;
  hours_worked: number;
  late_minutes: number;
  undertime_minutes: number;
  penalty_amount: number;
  detected_overtime_minutes: number; // punched out past the scheduled end (unpaid until approved)
  overtime_minutes: number; // approved by the payroll manager — these are paid
  overtime_amount: number;
  amount_earned: number;
  is_holiday: boolean;
  is_rest_day: boolean;
}

export interface Payslip {
  id: string;
  user_id: string;
  staff_name: string;
  designation: string | null;
  institution_name: string | null;
  institution_address: string | null;
  institution_logo: string | null;
  period: {
    id: string;
    name: string;
    date_from: string;
    date_to: string;
    status: PayrollPeriodStatus;
    paid_on: string | null;
  } | null;
  daily_rate: number;
  hourly_rate: number;
  hours_per_day: number;
  late_penalty_per_minute: number;
  undertime_penalty_per_minute: number;
  overtime_rate_per_minute: number;
  days_worked: number;
  hours_worked: number;
  late_minutes: number;
  undertime_minutes: number;
  penalty_total: number;
  overtime_minutes: number;
  overtime_total: number;
  gross_pay: number;
  deductions: PayslipDeduction[];
  employer_share_total: number;
  total_deductions: number;
  net_pay: number;
  days: PayslipDay[];
  updated_at?: string;
}

// One deduction line on a payslip; name is a snapshot of the type name.
export interface PayslipDeduction {
  id?: string;
  deduction_type_id: string | null;
  name: string;
  amount: number;
  employer_amount: number;
}

export interface UpdatePayslipData {
  designation?: string | null;
  daily_rate?: number;
  hourly_rate?: number;
  deductions?: {
    deduction_type_id: string | null;
    name: string;
    amount: number;
    employer_amount?: number;
  }[];
}

export interface UpdatePayslipDayData {
  time_in: string | null;
  time_out: string | null;
  overtime_minutes?: number; // approved OT minutes for the day
}

// =====================
// Payslip templates (designer)
// =====================

export type PayslipTemplateElementType =
  | 'institution_logo'
  | 'institution_name'
  | 'institution_address'
  | 'title'
  | 'pay_date'
  | 'employee_name'
  | 'designation'
  | 'covered_period'
  | 'daily_rate'
  | 'hourly_rate'
  | 'total_working_days'
  | 'total_hours'
  | 'total_salary_earned'
  | 'deductions_list'
  | 'total_deductions'
  | 'employer_benefits_list'
  | 'net_pay'
  | 'pay_master'
  | 'received_by'
  | 'signature_line'
  | 'divider'
  | 'custom_text'
  | 'spacer';

export interface PayslipTemplateElement {
  id: string;
  type: PayslipTemplateElementType;
  label?: string;
  // Free text for custom_text/title, or the person's name for pay_master.
  content?: string;
}

export interface PayslipTemplate {
  id: string;
  institution_id: string;
  name: string;
  is_default: boolean;
  paper_size: string;
  layout: PayslipTemplateElement[];
  created_at?: string;
  updated_at?: string;
}

export interface SavePayslipTemplateData {
  name: string;
  is_default?: boolean;
  paper_size?: string;
  layout: PayslipTemplateElement[];
}
