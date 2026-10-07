import type { ReportCardLayout } from '../../types'

/**
 * The report card layouts a school can build a template from, and the settings
 * each one exposes.
 *
 * A template stores only what the school changed. Everything here is the
 * layout's pre-filled design: the wording a card prints when a setting was
 * never touched, so a brand-new template already prints a complete card and
 * a layout can gain a setting without every saved template needing a backfill.
 *
 * The server keeps a matching list of layout keys (ReportCardTemplate::LAYOUTS);
 * adding a layout means adding it there too.
 */

export type ReportCardSettingValue = string | number | boolean

export interface ReportCardSettingField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'boolean' | 'select'
  /** Settings screen section the field is listed under. */
  section: string
  help?: string
  placeholder?: string
  options?: { value: string; label: string }[]
  rows?: number
}

export interface ReportCardLayoutDefinition {
  value: ReportCardLayout
  label: string
  description: string
  defaults: Record<string, ReportCardSettingValue>
  fields: ReportCardSettingField[]
}

const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((label, index) => ({ value: String(index + 1), label }))

const SHS_LETTER_BODY = [
  'The {school} has the honor to help your child obtain the basic knowledge, habits and skills to prepare him/her adequately for the future.',
  "This progress report evaluates the child's different aspects of growth while in school. His/her achievement has much to say about his/her physical development.",
  'Therefore, we request your full cooperation to help your child grow and achieve the expected level of development of his/her age.',
  "The marks indicate where your child is. This report will help us assess the strengths and weaknesses of your child so that we can guide him/her accordingly. Confer with us regarding your child's school standing.",
].join('\n\n')

/**
 * Senior High School, two semesters of two quarters each — the SF 9 a Grade 11
 * or 12 learner takes home. Folded in half: the outside carries attendance,
 * signatures, the certificate of promotion and the school's cover; the inside
 * carries both semesters' grades and the observed values.
 */
export const SHS_SEMESTRAL_LAYOUT: ReportCardLayoutDefinition = {
  value: 'shs_semestral',
  label: 'Senior High School — Semestral (SF 9)',
  description:
    'Two semesters of two quarters, each split into Core and Applied and Specialized subjects, with a semester final grade and general average. Observed values, attendance and the certificate of promotion on the same folded sheet.',
  defaults: {
    paper_size: 'LETTER',
    form_label: 'SF 9',
    show_deped_header: true,
    deped_header: 'Republic of the Philippines\nDEPARTMENT OF EDUCATION',
    school_name: '',
    school_subtitle: '',
    card_title: 'SENIOR HIGH SCHOOL REPORT CARD',
    curriculum_label: '(K to 12 Curriculum)',
    letter_greeting: 'Dear Parents,',
    letter_body: SHS_LETTER_BODY,
    letter_closing: "For your child's sake,",
    progress_title: "LEARNER'S PROGRESS REPORT CARD",
    show_track_strand: true,
    core_group_label: 'Core Subjects',
    applied_group_label: 'Applied and Specialized Subjects',
    attendance_start_month: '6',
    attendance_end_month: '4',
    show_parent_signatures: true,
    show_promotion_certificate: true,
    show_transfer_cancellation: true,
  },
  fields: [
    {
      key: 'paper_size',
      label: 'Paper size',
      type: 'select',
      section: 'Page',
      help: 'Printed landscape and folded in half.',
      options: [
        { value: 'LETTER', label: 'Letter (8.5 × 11 in)' },
        { value: 'FOLIO', label: 'Long / Folio (8.5 × 13 in)' },
        { value: 'LEGAL', label: 'Legal (8.5 × 14 in)' },
        { value: 'A4', label: 'A4' },
      ],
    },
    { key: 'form_label', label: 'Form label', type: 'text', section: 'Cover', placeholder: 'SF 9' },
    { key: 'show_deped_header', label: 'Show the DepEd header and logo', type: 'boolean', section: 'Cover' },
    { key: 'deped_header', label: 'DepEd header', type: 'textarea', section: 'Cover', rows: 2 },
    {
      key: 'school_name',
      label: 'School name as printed',
      type: 'text',
      section: 'Cover',
      help: "Leave blank to print the school's name from Settings.",
    },
    {
      key: 'school_subtitle',
      label: 'Line under the school name',
      type: 'text',
      section: 'Cover',
      placeholder: 'e.g. General Santos City Chapter',
    },
    { key: 'card_title', label: 'Card title', type: 'text', section: 'Cover' },
    { key: 'curriculum_label', label: 'Curriculum line', type: 'text', section: 'Cover' },
    { key: 'letter_greeting', label: 'Letter greeting', type: 'text', section: 'Letter to parents' },
    {
      key: 'letter_body',
      label: 'Letter',
      type: 'textarea',
      section: 'Letter to parents',
      rows: 8,
      help: 'Leave a blank line between paragraphs. {school} prints the school name.',
    },
    {
      key: 'letter_closing',
      label: 'Closing line',
      type: 'text',
      section: 'Letter to parents',
      help: "Printed above the principal's name.",
    },
    { key: 'progress_title', label: 'Grades page title', type: 'text', section: 'Grades' },
    { key: 'show_track_strand', label: "Print the section's Track/Strand", type: 'boolean', section: 'Grades' },
    { key: 'core_group_label', label: 'Core subjects heading', type: 'text', section: 'Grades' },
    { key: 'applied_group_label', label: 'Applied and specialized subjects heading', type: 'text', section: 'Grades' },
    { key: 'attendance_start_month', label: 'Attendance starts in', type: 'select', section: 'Attendance', options: MONTH_OPTIONS },
    { key: 'attendance_end_month', label: 'Attendance ends in', type: 'select', section: 'Attendance', options: MONTH_OPTIONS },
    { key: 'show_parent_signatures', label: "Parent/Guardian's signature lines", type: 'boolean', section: 'Back page' },
    { key: 'show_promotion_certificate', label: 'Certificate of Promotion', type: 'boolean', section: 'Back page' },
    { key: 'show_transfer_cancellation', label: 'Cancellation of Transfer Eligibility', type: 'boolean', section: 'Back page' },
  ],
}

export const REPORT_CARD_LAYOUTS: Record<ReportCardLayout, ReportCardLayoutDefinition> = {
  shs_semestral: SHS_SEMESTRAL_LAYOUT,
}

export const getReportCardLayout = (layout: string | null | undefined): ReportCardLayoutDefinition | null =>
  (layout && (REPORT_CARD_LAYOUTS as Record<string, ReportCardLayoutDefinition>)[layout]) || null

/** A template's settings over its layout's defaults. */
export function resolveReportCardSettings(
  layout: ReportCardLayoutDefinition,
  settings: Record<string, ReportCardSettingValue> | null | undefined
): Record<string, ReportCardSettingValue> {
  return { ...layout.defaults, ...(settings ?? {}) }
}
