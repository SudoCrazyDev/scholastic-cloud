// Common types used across the application
import type { InstitutionTheme } from '../theme/palette';

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
  /** Permission strings ("finance.manage") the user's role grants. */
  permissions?: string[];
  /** True for super-administrators, who hold a wildcard grant. */
  full_access?: boolean;
  user_institutions?: UserInstitution[];
}

export interface Role {
  id: string;
  /** Null for the platform's built-in roles; set for institution-created ones. */
  institution_id?: string | null;
  title: string;
  slug: string;
  /** Built-in roles are shared platform-wide and cannot be edited or deleted. */
  is_system?: boolean;
  permissions?: string[];
  assigned_users_count?: number;
  created_at: string;
  updated_at: string;
}

/** One switchable ability beyond the view/manage pair, e.g. approving voids. */
export interface ModuleSpecialAbility {
  key: string;
  permission: string;
  label: string;
  description?: string | null;
}

export interface ModuleCatalogEntry {
  key: string;
  label: string;
  description?: string | null;
  system_only: boolean;
  /**
   * Usually ['view', 'manage']. Empty when a module's access is not a role's to
   * give — Tala is granted to individual teachers by an administrator — in which
   * case the role builder must not draw those toggles.
   */
  base_abilities?: string[];
  special: ModuleSpecialAbility[];
}

export interface ModuleCatalogGroup {
  key: string;
  label: string;
  modules: ModuleCatalogEntry[];
}

export interface ModuleCatalog {
  groups: ModuleCatalogGroup[];
  abilities: string[];
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
  /** Permission strings the role should hold. Omit for a role with no access. */
  permissions?: string[];
}

export interface UpdateRoleData {
  title?: string;
  permissions?: string[];
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
  // Set instead of school_fee_id when the payment settles an additional fee (ad-hoc
  // charge or a late fee booked for an overdue installment).
  student_additional_fee_id?: string | null;
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
  additional_fee?: StudentAdditionalFee;
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
  // Allocates the line to an additional fee (late fees included). Mutually
  // exclusive with school_fee_id.
  additional_fee_id?: string | null;
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
  sibling_group_id?: string | null;
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

export interface SiblingGroupMember {
  id: string;
  sibling_group_id: string;
  student_id: string;
  discount_type?: 'fixed' | 'percentage' | null;
  discount_value?: number | string | null;
  student?: Student;
  created_at: string;
  updated_at: string;
}

export interface SiblingGroup {
  id: string;
  institution_id: string;
  name?: string | null;
  notes?: string | null;
  members?: SiblingGroupMember[];
  /** Non-voided sibling discounts for the requested academic year. */
  discounts?: StudentDiscount[];
  created_at: string;
  updated_at: string;
}

export interface CreateSiblingGroupData {
  name?: string;
  notes?: string;
  student_ids: string[];
}

export interface UpdateSiblingMemberData {
  discount_type?: 'fixed' | 'percentage' | null;
  discount_value?: number | null;
}

export interface ApplySiblingDiscountData {
  academic_year: string;
  discount_type?: 'fixed' | 'percentage';
  value?: number;
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
  // Present on charges and payments tied to an additional fee; 'late_fee' marks an
  // overdue-installment charge.
  source?: StudentAdditionalFeeSource;
  installment_sequence?: number;
  late_fee_percentage?: number;
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

export type ReceiptSubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentReceiptSubmission {
  id: string;
  institution_id: string;
  student_id: string;
  academic_year: string;
  installment_sequence: number;
  installment_label?: string | null;
  amount?: number | string | null;
  file_name: string;
  mime_type?: string | null;
  url?: string | null;
  status: ReceiptSubmissionStatus;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  student_payment_id?: string | null;
  created_at?: string;
  updated_at?: string;
  student?: { id: string; first_name: string; middle_name?: string | null; last_name: string };
  reviewer?: { id: string; first_name: string; last_name: string } | null;
}

// Legacy enum kept for back-compat; plans are now identified by payment_plan_id + name.
export type StudentPaymentPlanType = 'monthly' | 'quarterly';

// How money collected before the schedule's first month is treated.
//   'equal_split'        — it settles installments earliest-first (the default).
//   'net_of_downpayment' — it is a downpayment deducted from the amount being divided,
//                          so every installment is smaller.
export type AdvancePaymentMode = 'equal_split' | 'net_of_downpayment';

// How a plan assesses the late-fee percentages its installments carry.
//   'per_installment' — each installment is surcharged once, on its own amount (the default).
//   'carry_over'      — the unpaid balance rolls forward and is surcharged again each period,
//                       on top of that period's own overdue surcharge. Earlier surcharges are
//                       part of the carried balance, so the charge compounds.
export type SurchargeMode = 'per_installment' | 'carry_over';

export interface StudentPaymentPlan {
  id: string;
  academic_year: string;
  payment_plan_id?: string | null;
  name?: string | null;
  plan_type?: StudentPaymentPlanType | null;
  advance_payment_mode?: AdvancePaymentMode;
  surcharge_mode?: SurchargeMode;
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
  advance_payment_mode?: AdvancePaymentMode;
  surcharge_mode?: SurchargeMode;
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
  advance_payment_mode?: AdvancePaymentMode;
  surcharge_mode?: SurchargeMode;
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
export type CalendarEventType = 'holiday' | 'event' | 'suspension';

// What payroll does with the day.
//  'normal'        — price by the usual hours / penalty rules
//  'full_day_paid' — every staff member earns the full daily rate, punches or not
//  'no_pay'        — the day earns nothing
// Independent of `dismissal_time`, which instead shortens the working day so
// staff who stayed until dismissal earn a full day through the normal rules.
export type CalendarPayTreatment = 'normal' | 'full_day_paid' | 'no_pay';

export interface StaffCalendarEvent {
  id: string;
  institution_id?: string;
  title: string;
  description?: string | null;
  type: CalendarEventType;
  pay_treatment: CalendarPayTreatment;
  dismissal_time?: string | null; // "HH:MM" — early dismissal for a half-day
  event_date: string; // YYYY-MM-DD
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreateStaffCalendarEventData {
  title: string;
  description?: string | null;
  type: CalendarEventType;
  pay_treatment?: CalendarPayTreatment;
  dismissal_time?: string | null;
  event_date: string;
}

// --- Attendance exception requests (HRIS) ---

export type AttendanceRequestKind =
  | 'late_arrival'
  | 'early_out'
  | 'official_business'
  | 'forgot_punch';

export type AttendanceRequestStatus =
  | 'pending'
  | 'approved'
  | 'disapproved'
  | 'cancelled'
  // Approved, then taken back by an approver — no longer affects pay.
  | 'voided';

export interface StaffAttendanceRequest {
  id: string;
  user_id: string;
  staff_name: string | null;
  date_from: string; // YYYY-MM-DD
  date_to: string;
  kind: AttendanceRequestKind;
  waive_late: boolean;
  waive_undertime: boolean;
  pay_full_day: boolean;
  credited_time_in: string | null; // "HH:MM"
  credited_time_out: string | null;
  reason: string;
  status: AttendanceRequestStatus;
  review_note: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  void_note: string | null;
  voided_by_name: string | null;
  voided_at: string | null;
  created_at: string | null;
}

export interface CreateAttendanceRequestData {
  user_id?: string | null; // approvers only — file on behalf of a staff member
  date_from: string;
  date_to: string;
  kind: AttendanceRequestKind;
  reason: string;
  credited_time_in?: string | null;
  credited_time_out?: string | null;
  // Approver-only overrides of the defaults derived from `kind`.
  waive_late?: boolean;
  waive_undertime?: boolean;
  pay_full_day?: boolean;
}

export interface ApproveAttendanceRequestData {
  waive_late?: boolean;
  waive_undertime?: boolean;
  pay_full_day?: boolean;
  credited_time_in?: string | null;
  credited_time_out?: string | null;
  review_note?: string | null;
}

// --- My timesheet (the signed-in staff member's own punches) ---

// What is wrong with a day, as payroll would read it. Null when nothing is.
export type TimesheetIssue = 'no_punch' | 'missing_out' | 'late' | 'undertime';

export interface TimesheetDay {
  date: string; // YYYY-MM-DD
  weekday: string; // "Mon"
  is_rest_day: boolean;
  is_holiday: boolean;
  is_today: boolean;
  schedule_start: string | null; // "HH:MM"
  schedule_end: string | null;
  grace_minutes: number;
  time_in: string | null; // "HH:MM"
  time_out: string | null;
  // The time came from an approved request rather than the biometric device.
  credited_time_in: boolean;
  credited_time_out: boolean;
  punch_count: number;
  hours_worked: number;
  late_minutes: number;
  undertime_minutes: number;
  pay_policy: 'normal' | 'full_day' | 'no_pay';
  exception_label: string | null;
  issue: TimesheetIssue | null;
  // A live request of the staff member's own already covering this date.
  request: { id: string; kind: AttendanceRequestKind; status: AttendanceRequestStatus } | null;
}

export interface MyTimesheet {
  from: string;
  to: string;
  today: string;
  // When the biometric devices last reported anything, so a gap in the logs
  // is not mistaken for a week of absences.
  last_attendance_date: string | null;
  days: TimesheetDay[];
}

// One surcharge booked against an installment.
//   'installment' — assessed on the period's own unpaid principal when its grace elapsed.
//   'carry_over'  — assessed on the balance rolled into the period when it opened.
export interface InstallmentSurcharge {
  id: string;
  stage: 'installment' | 'carry_over';
  name: string;
  amount: number;
  base_amount?: number | null;
  percentage?: number | null;
  assessed_on?: string | null;
}

export interface StudentInstallment {
  sequence: number;
  label: string;
  due_date: string;
  grace_period_days: number;
  overdue_date: string;
  is_overdue: boolean;
  late_fee_percentage: number;
  // Every surcharge charged against this period, totalled (0 when none was booked). A
  // carry-over plan can charge a period twice — once for the balance rolled into it, once
  // for its own overdue principal — so `late_fee_charges` itemizes what makes it up.
  late_fee_amount: number;
  late_fee_applied?: boolean;
  // The surcharge on this period's own principal, which is the only kind a
  // per-installment plan ever charges.
  late_fee_id?: string | null;
  late_fee_charges?: InstallmentSurcharge[];
  amount: number;
  original_amount: number;
  discount_amount: number;
  paid_amount: number;
  status: 'paid' | 'partial' | 'pending';
}

// Money collected before the schedule's first month on a 'net_of_downpayment' plan. Zero
// (with a null boundary) on every other plan.
export interface ScheduleDownpayment {
  amount: number;
  // First day of the first installment's month — payments before it are the downpayment.
  boundary?: string | null;
}

export interface LedgerFeeBreakdown {
  fee_id: string;
  fee_name: string;
  is_additional: boolean;
  source?: StudentAdditionalFeeSource;
  // Whether this fee is inside the payment schedule. Standard grade-level fees and late
  // fees are; a cash-basis ad-hoc fee is collected on its own.
  billing_type?: FeeBillingType;
  installment_sequence?: number | null;
  charge: number;
  discount: number;
  paid: number;
  outstanding: number;
}

// Charges that never entered the payment schedule, reported so the schedule can leave
// them out of Total Payable without calling their collections unapplied.
export interface LedgerCashBasisSummary {
  charges: number;
  paid: number;
  outstanding: number;
  fee_count: number;
}

export interface StudentLedgerResponse {
  student: Student;
  academic_year: string;
  grade_level?: string;
  section?: string;
  entries: StudentLedgerEntry[];
  totals: {
    charges: number;
    // Portion of `charges` booked as late fees for overdue installments.
    late_fees?: number;
    // Portion of `charges` booked as cash-basis fees, outside the schedule.
    cash_fees?: number;
    discounts: number;
    payments: number;
    balance_forward: number;
    balance: number;
  };
  cash_basis?: LedgerCashBasisSummary;
  fee_breakdown?: LedgerFeeBreakdown[];
  unallocated_payments?: number;
  payment_plan?: StudentPaymentPlan | null;
  downpayment?: ScheduleDownpayment;
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
    is_additional?: boolean;
    source?: StudentAdditionalFeeSource;
    billing_type?: FeeBillingType;
    installment_sequence?: number | null;
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
    late_fees?: number;
    cash_fees?: number;
    discounts: number;
    payments: number;
    balance_forward: number;
    balance: number;
  };
  cash_basis?: LedgerCashBasisSummary;
  payment_plan?: StudentPaymentPlan | null;
  downpayment?: ScheduleDownpayment;
  installments?: StudentInstallment[];
  available_academic_years?: string[];
}

export interface StudentReceipt {
  payment: StudentPayment;
  student: Student;
  institution?: Institution;
  received_by?: User;
}

// One enrolled student on the Finance dashboard: what the academic year bills them and
// what is left of it. Built from the same figures as their ledger.
export interface FinanceDashboardStudent {
  id: string;
  lrn?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name?: string | null;
  ext_name?: string | null;
  // "LAST NAME, FIRST NAME M." — the form finance lists students in.
  display_name: string;
  grade_level: string;
  section_id: string;
  section: string;
  charges: number;
  discounts: number;
  balance_forward: number;
  total_payable: number;
  total_paid: number;
  remaining_balance: number;
  // Ad-hoc charges, cash-basis fees and late fees booked for the year, so a row can say
  // whether it has anything to open before it is opened.
  other_fee_count: number;
}

export interface FinanceDashboardSection {
  id: string;
  title: string;
  grade_level: string;
}

export interface FinanceStudentBalances {
  academic_year: string;
  grade_levels: string[];
  sections: FinanceDashboardSection[];
  students: FinanceDashboardStudent[];
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
export type StudentAdditionalFeeSource = 'manual' | 'late_fee';

export interface StudentAdditionalFee {
  id: string;
  institution_id: string;
  student_id: string;
  // Set when the charge was picked from a saved student fee instead of typed by hand.
  student_fee_id?: string | null;
  academic_year: string;
  name: string;
  description?: string | null;
  // 'late_fee' rows are booked automatically for overdue payment-plan installments;
  // deleting one waives the fee.
  source?: StudentAdditionalFeeSource;
  // The basis this charge was posted under. It is fixed at posting time, so re-pointing
  // the saved fee it came from never moves a charge already on the ledger.
  billing_type?: FeeBillingType;
  installment_sequence?: number | null;
  late_fee_percentage?: number | null;
  base_amount?: number | null;
  amount: number;
  created_at: string;
  updated_at: string;
  // Present only when the fee list was fetched with `with_waived`. A waived late fee is
  // never re-charged, so these identify what was written off and by whom.
  deleted_at?: string | null;
  deleted_by?: string | null;
  waived_by_name?: string | null;
  waive_note?: string | null;
}

export interface CreateStudentAdditionalFeeData {
  student_id: string;
  student_fee_id?: string;
  academic_year: string;
  name: string;
  description?: string;
  billing_type?: FeeBillingType;
  amount: number;
}

// How a fee is collected. 'cash' stands on its own outside the payment plan (the
// default); 'installment' joins the principal the plan splits across installments.
export type FeeBillingType = 'cash' | 'installment';

export interface StudentFee {
  id: string;
  institution_id: string;
  name: string;
  amount: number;
  billing_type?: FeeBillingType;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateStudentFeeData {
  name: string;
  amount: number;
  billing_type?: FeeBillingType;
  description?: string;
  is_active?: boolean;
}

export interface UpdateStudentFeeData {
  name?: string;
  amount?: number;
  billing_type?: FeeBillingType;
  description?: string;
  is_active?: boolean;
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

export interface CollectionReportBreakdownRow {
  label: string;
  entries: number;
  transactions?: number;
  amount: number;
}

export interface CollectionReportDailyRow {
  label: string;
  transactions: number;
  entries: number;
  amount: number;
}

export interface CollectionReportTransaction {
  date: string;
  or_number: string | null;
  receipt_number: string | null;
  student: string;
  lrn?: string | null;
  method: string;
  cashier: string;
  entries: number;
  amount: number;
}

export interface CollectionReportResponse {
  start_date: string;
  end_date: string;
  institution: {
    title: string;
    abbr: string;
    address?: string | null;
  } | null;
  summary: {
    total_collected: number;
    transaction_count: number;
    entry_count: number;
    student_count: number;
    voided_count: number;
    voided_amount: number;
    average_per_transaction: number;
    method_count: number;
  };
  by_method: CollectionReportBreakdownRow[];
  by_fee: CollectionReportBreakdownRow[];
  by_student_fee: CollectionReportBreakdownRow[];
  by_cashier: CollectionReportBreakdownRow[];
  by_day: CollectionReportDailyRow[];
  transactions: CollectionReportTransaction[];
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

// Disbursement types
export interface DisbursementType {
  id: string;
  institution_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DisbursementReceipt {
  id: string;
  url: string | null;
  name: string | null;
  mime: string | null;
}

export interface Disbursement {
  id: string;
  institution_id: string;
  disbursement_type_id: string | null;
  type_name: string | null;
  title: string;
  description: string | null;
  amount: string;
  date_issued: string;
  in_charge_user_id: string | null;
  in_charge_name: string | null;
  receipts: DisbursementReceipt[];
  created_at: string;
  updated_at: string;
}

export interface DisbursementFormData {
  title: string;
  description?: string;
  amount: number;
  date_issued: string;
  disbursement_type_id?: string | null;
  in_charge_user_id?: string | null;
  receipts?: File[];
  remove_receipt_ids?: string[];
}

// Institution types
/**
 * How a school year is divided into grading periods. DepEd's newer structure
 * uses 3 terms; the legacy structure uses 4 quarters. Institutions adopt the
 * change on a school-year boundary, so this is recorded per academic year.
 *
 * The stored period value stays a plain ordinal ('1'..'4') everywhere, so a
 * term-based year simply never uses '4'. Only the count and labels change.
 */
export type GradingPeriodType = 'quarter' | 'term';

export interface GradingPeriod {
  /** Stored ordinal, e.g. '1'. */
  value: string;
  /** Ordinal label, e.g. '1st Quarter' or '2nd Term'. */
  label: string;
  /** Compact label, e.g. 'Q1' or 'T2'. */
  short: string;
  /** Numbered label, e.g. 'Quarter 1' or 'Term 2'. */
  numbered: string;
}

export interface GradingPeriodConfig {
  type: GradingPeriodType;
  /** 4 for quarters, 3 for terms. */
  count: number;
  /** 'Quarter' | 'Term' */
  noun: string;
  /** 'Quarters' | 'Terms' */
  noun_plural: string;
  periods: GradingPeriod[];
}

export interface InstitutionAcademicYear {
  id: string;
  institution_id: string;
  year: string;
  grading_period_type: GradingPeriodType;
  grading_periods?: GradingPeriodConfig;
  is_current: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Institution {
  id: string;
  title: string;
  abbr: string;
  address?: string;
  division?: string;
  region?: string;
  gov_id?: string;
  logo?: string;
  theme?: InstitutionTheme | null;
  default_department_id?: string | null;
  default_department?: Department | null;
  current_academic_year?: string | null;
  /** Resolved quarter-vs-term config for the institution's current academic year. */
  grading_periods?: GradingPeriodConfig | null;
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
  /** Grade level of the student's current (active) section — provided by GET /students. */
  current_grade_level?: string | null;
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
  religion: 'Islam' | 'Catholic' | 'Iglesia Ni Cristo' | 'Baptists' | 'PMCC (4w)' | 'Others';
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
  religion?: 'Islam' | 'Catholic' | 'Iglesia Ni Cristo' | 'Baptists' | 'PMCC (4w)' | 'Others';
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

export interface RfidScanLogPagination {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface ClassSectionDailyAttendanceRow {
  student: Pick<Student, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'lrn' | 'gender'>;
  first_in: string | null;
  last_out: string | null;
  scan_count: number;
  status: 'present' | 'absent';
  logs: Array<Pick<RfidScanLog, 'id' | 'student_id' | 'scanned_at' | 'type' | 'device_name'>>;
}

export interface ClassSectionDailyAttendanceSummary {
  date: string;
  total_students: number;
  present: number;
  absent: number;
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

// How a deduction arrives at its peso figure: a flat amount, a percentage
// of the salary named by `percent_basis`, or a table of salary ranges that
// same salary is looked up in.
export type PayrollDeductionCalculationType = 'fixed' | 'percentage' | 'bracket';

// Whether one salary range quotes its two shares in pesos or as rates.
export type PayrollBracketAmountType = 'fixed' | 'percentage';

// One salary range of a bracket deduction type: the salaries it covers, and
// what the employee and the employer each pay inside it. A null max_salary is
// the open-ended top range ("₱30,000 and above").
export interface PayrollDeductionBracket {
  id?: string;
  min_salary: number;
  max_salary: number | null;
  amount_type: PayrollBracketAmountType;
  employee_amount: number;
  employee_rate_percent: number;
  employer_amount: number;
  employer_rate_percent: number;
}

// What a percentage deduction is taken from.
// 'basic_pay'  — daily rate × scheduled working days, before any late,
//                undertime or absence is taken off (SSS and friends).
// 'gross_pay'  — what the staff member actually earned, penalties and all.
export type PayrollDeductionPercentBasis = 'basic_pay' | 'gross_pay';

// Institution-defined deduction catalog entry (SSS, Pag-IBIG, Cash Advance, ...).
export interface PayrollDeductionType {
  id: string;
  name: string;
  calculation_type: PayrollDeductionCalculationType;
  default_amount: number; // fixed types only
  rate_percent: number; // percentage types only — percent, not a fraction (5 = 5%)
  has_employer_share: boolean;
  default_employer_amount: number;
  employer_rate_percent: number;
  // Also the salary a bracket type's table is looked up on.
  percent_basis: PayrollDeductionPercentBasis;
  is_active: boolean;
  sort_order: number;
  // Bracket types only; empty for the other two.
  brackets: PayrollDeductionBracket[];
  updated_at?: string;
}

export interface SavePayrollDeductionTypeData {
  name: string;
  calculation_type?: PayrollDeductionCalculationType;
  default_amount?: number;
  rate_percent?: number;
  has_employer_share?: boolean;
  default_employer_amount?: number;
  employer_rate_percent?: number;
  percent_basis?: PayrollDeductionPercentBasis;
  is_active?: boolean;
  // Required for a bracket type, ignored for the other two.
  brackets?: PayrollDeductionBracket[];
  // Edit only: overwrite every staff member's own amount with these defaults.
  // New types are handed to all staff automatically.
  apply_to_all_staff?: boolean;
}

// A staff member's default figures for one deduction type. A percentage type
// carries rates and leaves the amounts at 0 — the peso is only known once a
// payslip has a salary to take the percentage of.
export interface PayrollCompensationDeduction {
  deduction_type_id: string;
  name: string | null;
  calculation_type: PayrollDeductionCalculationType;
  amount: number;
  rate_percent: number;
  employer_amount: number;
  employer_rate_percent: number;
  percent_basis: PayrollDeductionPercentBasis | null;
  // True when the staff member has no figure of their own and inherits the
  // deduction type's default.
  from_default?: boolean;
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
  // Bracket types this staff member is off entirely. They are absent from
  // `deductions` — nothing is deducted — so this is the only record of it.
  exempt_deduction_type_ids: string[];
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
  deductions?: {
    deduction_type_id: string;
    amount: number;
    employer_amount?: number;
    // Read instead of the amounts when the type is a percentage one.
    rate_percent?: number;
    employer_rate_percent?: number;
    // The only thing read for a bracket type — its table works the figures
    // out from the salary, so all a staff row can say is "not this one".
    is_exempt?: boolean;
  }[];
}

export type PayrollPeriodStatus = 'draft' | 'finalized';

// 'all' pays everyone with a compensation rate; 'schedules' pays only the staff
// assigned to the schedules listed on the period.
export type PayrollPeriodScheduleScope = 'all' | 'schedules';

export interface PayrollPeriod {
  id: string;
  institution_id: string;
  name: string;
  date_from: string;
  date_to: string;
  schedule_scope: PayrollPeriodScheduleScope;
  staff_schedule_ids: string[];
  staff_schedules: { id: string; name: string }[];
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
  schedule_scope: PayrollPeriodScheduleScope;
  staff_schedule_ids: string[];
}

// Saving a period succeeds even when it leaves days uncovered by any payroll —
// `warning` carries that sentence so the screen can say so without blocking.
export interface PayrollPeriodSaveResponse extends ApiResponse<PayrollPeriod> {
  warning?: string | null;
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
  assumed_days: number; // days priced from punches that had not been made yet
  hours_worked: number;
  late_minutes: number;
  undertime_minutes: number;
  penalty_total: number;
  overtime_minutes: number;
  overtime_total: number;
  basic_pay: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
}

// The payslips of one period, plus every date across them that rests on an
// assumed punch — finalizing pays those out, so the screen says so first.
export interface PayslipListResponse extends ApiResponse<PayslipSummary[]> {
  assumed_dates?: string[];
}

// =====================
// Payroll sheet (the printed monthly summary of a whole period)
// =====================

// One deduction / employer-share column on the sheet. `key` groups the payslip
// lines that share it; `label` is the printed heading.
export interface PayrollSheetColumn {
  key: string;
  label: string;
}

export interface PayrollSheetRow {
  no: number;
  payslip_id: string;
  staff_name: string | null;
  designation: string | null;
  days_worked: number;
  assumed_days: number; // > 0 puts an asterisk on the row's working days
  hours_worked: number;
  daily_rate: number;
  // Aligned index-for-index with the sheet's benefit_columns / deduction_columns.
  benefits: number[];
  employer_share_total: number;
  gross_pay: number; // already net of late/undertime
  // The late/undertime the salary gave up. The sheet adds it back into TOTAL
  // SALARY EARNED and itemizes it under DEDUCTIONS, so the net still foots.
  penalty_charged: number;
  overtime_total: number; // approved overtime pay, already inside gross_pay
  deductions: number[];
  total_deductions: number;
  net_pay: number;
}

export interface PayrollSheet {
  period: {
    id: string;
    name: string;
    date_from: string;
    date_to: string;
    status: PayrollPeriodStatus;
    paid_on: string | null;
  };
  institution: {
    name: string | null;
    address: string | null;
    logo: string | null;
  };
  benefit_columns: PayrollSheetColumn[];
  deduction_columns: PayrollSheetColumn[];
  rows: PayrollSheetRow[];
}

// =====================
// Payroll period report (what a finished period cost, totalled)
// =====================

// One deduction line totalled across the period. The employee and employer
// sides stay apart: remittance forms want them in separate columns, and only
// the employee side ever came out of anyone's pay.
export interface PayrollReportDeductionLine {
  key: string;
  name: string;
  employee_count: number; // staff the line actually charged
  employee_amount: number;
  employer_amount: number;
  total_amount: number;
}

export interface PayrollPeriodReport {
  period: {
    id: string;
    name: string;
    date_from: string;
    date_to: string;
    status: PayrollPeriodStatus;
    paid_on: string | null;
  };
  institution: {
    name: string | null;
    address: string | null;
  };
  summary: {
    employee_count: number;
    gross_total: number; // salary earned, already net of late/undertime/absences
    employee_deduction_total: number;
    employer_contribution_total: number; // a cost on top of salaries, not a deduction
    net_total: number; // the cash paid out to staff
    payroll_cost_total: number; // gross + employer share
  };
  deductions: PayrollReportDeductionLine[];
}

// How a payslip day is priced once any exception is taken into account.
// 'full_day' guarantees the daily rate regardless of hours worked.
export type PayslipDayPayPolicy = 'normal' | 'full_day' | 'no_pay';

export interface PayslipDay {
  id: string;
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  // Filled in from the schedule because payroll was generated before the punch
  // could be made, rather than read off a biometric device.
  assumed_time_in: boolean;
  assumed_time_out: boolean;
  required_hours: number;
  hours_worked: number;
  late_minutes: number;
  undertime_minutes: number;
  penalty_amount: number;
  detected_overtime_minutes: number; // punched out past the scheduled end (unpaid until approved)
  overtime_minutes: number; // approved by the payroll manager — these are paid
  overtime_amount: number;
  amount_earned: number;
  schedule_start: string | null; // "HH:MM" — reflects an announced dismissal time when the day was shortened
  schedule_end: string | null;
  waive_late: boolean;
  waive_undertime: boolean;
  pay_policy: PayslipDayPayPolicy;
  exception_label: string | null; // e.g. "Typhoon suspension · Approved early out"
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
  assumed_days: number;
  hours_worked: number;
  late_minutes: number;
  undertime_minutes: number;
  penalty_total: number;
  overtime_minutes: number;
  overtime_total: number;
  // Daily rate × scheduled working days — the salary before lates, undertime
  // and absences. What a percentage deduction is normally taken from.
  basic_pay: number;
  gross_pay: number;
  deductions: PayslipDeduction[];
  employer_share_total: number;
  total_deductions: number;
  attendance_charges: PayslipAttendanceCharges;
  net_pay: number;
  days: PayslipDay[];
  updated_at?: string;
}

// What late, undertime and absences cost — the figures the salary actually gave
// up, clipped the way pricing clipped them. They are already out of gross_pay;
// a printed pay slip adds them back into the salary and charges them under
// DEDUCTIONS so the staff member can see why the pay is short.
export interface PayslipAttendanceCharges {
  late: number;
  undertime: number;
  absent_days: number;
  absences: number;
}

// One deduction line on a payslip; name is a snapshot of the type name.
// A percentage line also snapshots the rate and the salary it was taken from,
// so the payslip can be reprinted years later and still explain itself.
export interface PayslipDeduction {
  id?: string;
  deduction_type_id: string | null;
  // Set when the line is one installment of an approved staff loan. Those
  // figures come off the loan's schedule, so the payslip editor locks them.
  staff_loan_id?: string | null;
  name: string;
  calculation_type: PayrollDeductionCalculationType;
  amount: number;
  rate_percent: number;
  employer_amount: number;
  employer_rate_percent: number;
  percent_basis: PayrollDeductionPercentBasis | null;
  basis_amount: number;
  // Which salary range a bracket line landed in, snapshotted so a reprint can
  // still explain the figure after the table has been revised.
  bracket_min: number | null;
  bracket_max: number | null;
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
    calculation_type?: PayrollDeductionCalculationType;
    // On a percentage line these are what is saved — the pesos are recomputed
    // from the salary server-side.
    rate_percent?: number;
    employer_rate_percent?: number;
    percent_basis?: PayrollDeductionPercentBasis;
  }[];
}

export interface UpdatePayslipDayData {
  time_in: string | null;
  time_out: string | null;
  overtime_minutes?: number; // approved OT minutes for the day
}

// =====================
// Staff loans
// =====================

// How interest is charged on a staff loan.
// 'none'        — the school is lending, not earning.
// 'add_on'      — flat interest on the whole principal for the whole term, then
//                 split evenly. Every installment is identical.
// 'diminishing' — interest on what is still owed, with a level monthly payment.
//                 The principal/interest split shifts month to month.
export type StaffLoanInterestMethod = 'none' | 'add_on' | 'diminishing';

// Whether the quoted rate is per month or per year.
export type StaffLoanRatePeriod = 'monthly' | 'annual';

export type StaffLoanStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';

export type StaffLoanInstallmentStatus = 'scheduled' | 'collected' | 'cancelled';

// One row of the amortization schedule. Written out in full when the loan is
// priced, so a rate change later can never rewrite what was already collected.
export interface StaffLoanInstallment {
  id: string;
  sequence: number;
  due_date: string;
  amount: number;
  principal_component: number;
  interest_component: number;
  // Principal still owed before and after this collection.
  opening_balance: number;
  closing_balance: number;
  status: StaffLoanInstallmentStatus;
  collected_amount: number;
  collected_at: string | null;
  payslip_id: string | null;
}

// One line of the loan's history — who did what, and when.
export interface StaffLoanEvent {
  id: string;
  action:
    | 'created'
    | 'updated'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'collected'
    | 'released'
    | 'completed';
  actor_name: string | null;
  amount: number | null;
  note: string | null;
  created_at: string;
}

export interface StaffLoan {
  id: string;
  reference_no: string;
  user_id: string;
  staff_name: string | null;
  purpose: string | null;
  principal_amount: number;
  interest_method: StaffLoanInterestMethod;
  interest_rate_percent: number;
  rate_period: StaffLoanRatePeriod;
  term_months: number;
  interest_amount: number;
  total_payable: number;
  // The level per-month figure. The last installment can differ by a centavo.
  installment_amount: number;
  amount_paid: number;
  balance: number;
  installments_paid: number;
  first_deduction_date: string;
  next_due_date: string | null;
  status: StaffLoanStatus;
  // Who encoded the deduction, and who signed it off.
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  completed_at: string | null;
  // Detail view only.
  installments?: StaffLoanInstallment[];
  events?: StaffLoanEvent[];
}

// A staff member a loan can be written against: payroll already knows a rate
// for them, so a payslip exists to collect it off.
export interface StaffLoanBorrower {
  user_id: string;
  staff_name: string | null;
  email: string;
  daily_rate: number;
  outstanding_balance: number;
}

// The terms half of a loan — what the quote endpoint prices.
export interface StaffLoanTerms {
  principal_amount: number;
  interest_method: StaffLoanInterestMethod;
  interest_rate_percent: number;
  rate_period: StaffLoanRatePeriod;
  term_months: number;
  first_deduction_date: string;
}

export interface SaveStaffLoanData extends StaffLoanTerms {
  user_id: string;
  purpose?: string | null;
}

// What a set of terms works out to, before anything is saved.
export interface StaffLoanQuote {
  principal: number;
  interest: number;
  total: number;
  installment: number;
  installments: {
    sequence: number;
    due_date: string;
    amount: number;
    principal_component: number;
    interest_component: number;
    opening_balance: number;
    closing_balance: number;
  }[];
}

export interface StaffLoanListResponse {
  success: boolean;
  message?: string;
  data: StaffLoan[];
  meta?: { can_approve: boolean; can_manage: boolean };
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
  // The attendance charges the itemized list already carries, for a layout that
  // would rather place them on their own rows.
  | 'late_deduction'
  | 'undertime_deduction'
  | 'absences_deduction'
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

// ── SMS Gateway ────────────────────────────────────────────────────────────
export interface SmsGateway {
  id: string;
  institution_id: string;
  name: string;
  location: string | null;
  platform: 'linux' | 'windows' | 'unknown';
  status: 'online' | 'offline' | 'unknown';
  is_paired: boolean;
  signal_strength: number | null;
  network_operator: string | null;
  sim_msisdn: string | null;
  sim_balance: string | null;
  imei: string | null;
  modem_model: string | null;
  agent_version: string | null;
  /**
   * Modem presence, reported on each heartbeat and held only in the server's
   * cache — null means no agent running 0.2.0+ has reported yet. Distinct from
   * `status`, which is about the agent, not the USB dongle.
   */
  modem_connected: boolean | null;
  modem_error: string | null;
  modem_port: string | null;
  modem_checked_at: string | null;
  /** A refresh has been queued but the kiosk has not collected it yet. */
  refresh_pending: boolean;
  last_seen_at: string | null;
  pairing_code?: string;
  pairing_code_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SmsMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'received'
  | 'canceled';

export interface SmsMessage {
  id: string;
  institution_id: string;
  gateway_id: string | null;
  direction: 'outbound' | 'inbound';
  to_number: string | null;
  from_number: string | null;
  body: string;
  status: SmsMessageStatus;
  segments: number;
  error: string | null;
  provider_ref: string | null;
  source: string | null;
  queued_by: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-gate (entrance/exit) SMS notification config for the Gate Entries module. */
export interface GateSmsSetting {
  id: string;
  institution_id: string;
  gate_type: 'enter' | 'exit';
  is_enabled: boolean;
  sms_gateway_id: string | null;
  message_template: string;
  cooldown_minutes: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface SmsSettings {
  id: string;
  institution_id: string;
  default_gateway_id: string | null;
  rate_limit_per_minute: number;
  send_window_start: string | null;
  send_window_end: string | null;
  opt_out_keywords: string;
  sender_name: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Finance data clearing ----

/**
 * A `year` group is deleted for the selected academic year only. A `catalog`
 * group's tables carry no academic year, so clearing one empties it for the
 * whole institution — the screen has to say so before it is ticked.
 */
export type FinanceDataClearScope = 'year' | 'catalog';

export interface FinanceDataClearGroup {
  key: string;
  label: string;
  description: string;
  scope: FinanceDataClearScope;
  tables: string[];
}

export interface FinanceDataClearCatalog {
  groups: FinanceDataClearGroup[];
  /** Areas the clear never touches, named so the UI can state them outright. */
  excluded: string[];
}

export interface FinanceDataClearGroupPreview {
  key: string;
  label: string;
  description: string;
  scope: FinanceDataClearScope;
  total: number;
  tables: Record<string, number>;
}

/**
 * A reason the clear would destroy data outside the selected year. Every
 * foreign key into the finance tables is CASCADE or SET NULL, so the database
 * would not refuse — it would silently strand these rows.
 */
export interface FinanceDataClearBlocker {
  group: string;
  group_label: string;
  table: string;
  column: string;
  blocking_table: string;
  rule: 'set_null' | 'cascade';
  count: number;
  message: string;
}

export interface FinanceDataClearPreview {
  academic_year: string;
  groups: FinanceDataClearGroupPreview[];
  total: number;
  blockers: FinanceDataClearBlocker[];
  clearable: boolean;
}

export interface FinanceDataClearResult {
  log_id: string | null;
  academic_year: string;
  groups: string[];
  deleted_counts: Record<string, number>;
  total_deleted: number;
  files_deleted: number;
  files_failed: number;
}

export interface FinanceDataClearLogEntry {
  id: string;
  academic_year: string;
  groups: string[];
  group_labels: string[];
  deleted_counts: Record<string, number>;
  total_deleted: number;
  files_deleted: number;
  files_failed: number;
  cleared_by_name: string | null;
  cleared_by_role: string | null;
  created_at: string;
}
