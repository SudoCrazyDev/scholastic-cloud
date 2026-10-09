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
  /**
   * Where the card's marks come from. A `grades` card replaces the standard
   * Report Card of a class section; a `matatag` card replaces the progress
   * report printed from MATATAG Progress, whose ratings are not grades.
   */
  source: 'grades' | 'matatag'
  /** What a new template on this layout is called, and the grade levels it starts on. */
  suggestedName: string
  suggestedGradeLevel: RegExp
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
  source: 'grades',
  suggestedName: 'Senior High School Report Card',
  suggestedGradeLevel: /^grade\s*11$/i,
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

const KINDER_INTRO =
  "This progress report informs parents about their child's learning achievements based on the Kindergarten " +
  "Curriculum Guide. It provides a summary of the child's performance and indicates their level of progress " +
  'across different developmental domains every ten (10) weeks or each term. The report also helps determine ' +
  'whether additional time and follow-up support are needed for the child to achieve the expected competencies. ' +
  'Each competency is marked as: BG - Beginning, DV - Developing, and CO - Consistent.'

const KINDER_SCALE_NOTE =
  "This rating scale is used to record the learner's level of attainment for each competency across the " +
  'developmental domains. It guides teachers in assigning ratings based on observed performance and assessment ' +
  'results for each term.'

/**
 * Kindergarten, rated CO, DV or BG in each of three terms — a sheet printed
 * landscape on both sides and folded in three. The outside carries the
 * attendance and certificate of transfer, the teacher's remarks and the cover;
 * the inside carries every developmental competency.
 *
 * The competencies, their ratings and the remarks are the ones the adviser
 * keeps in MATATAG Progress: this layout is how they print, not a second place
 * to record them.
 */
export const KINDER_TRIFOLD_LAYOUT: ReportCardLayoutDefinition = {
  value: 'kinder_trifold',
  label: 'Kindergarten Progress Report — Tri-fold',
  source: 'matatag',
  suggestedName: 'Kindergarten Progress Report',
  // Every spelling a school uses: "Kinder 1", "Kindergarten 2", "Kinder", "K1", "K-2".
  suggestedGradeLevel: /^(kinder(garten)?\b|k\s*-?\s*\d+$)/i,
  description:
    "Every developmental competency rated CO, DV or BG for each term, with the teacher's remarks, the attendance and the certificate of transfer, on one sheet folded in three. Prints the ratings kept in MATATAG Progress.",
  defaults: {
    paper_size: 'A4',
    show_deped_header: true,
    deped_header: 'Republic of the Philippines\nDepartment of Education',
    region: '',
    district: '',
    school_name: '',
    chapter: '',
    title_style: 'image',
    card_title: 'Kindergarten Progress Report',
    intro: KINDER_INTRO,
    scale_note_title: 'IMPORTANT NOTE TO PARENTS/GUARDIANS',
    scale_note: KINDER_SCALE_NOTE,
    competencies_title: 'DEVELOPMENTAL COMPETENCIES',
    comments_title: "TEACHER'S COMMENTS/REMARKS",
    comments_hint: '(Provides specific observations, strengths, and suggested interventions)',
    show_parent_signatures: true,
    show_certificate: true,
    certificate_text: 'has developed the general competencies based on the Kindergarten Curriculum Guide.',
    heading_color: '#1f2a9e',
    band_color: '#2633c4',
    domain_color: '#fdf6c3',
  },
  fields: [
    {
      key: 'paper_size',
      label: 'Paper size',
      type: 'select',
      section: 'Page',
      help: 'Printed landscape and folded in three.',
      options: [
        { value: 'A4', label: 'A4' },
        { value: 'LETTER', label: 'Letter (8.5 × 11 in)' },
        { value: 'FOLIO', label: 'Long / Folio (8.5 × 13 in)' },
        { value: 'LEGAL', label: 'Legal (8.5 × 14 in)' },
      ],
    },
    { key: 'heading_color', label: 'Heading text colour', type: 'text', section: 'Page', placeholder: '#1f2a9e' },
    { key: 'band_color', label: 'Table header colour', type: 'text', section: 'Page', placeholder: '#2633c4' },
    { key: 'domain_color', label: 'Domain row colour', type: 'text', section: 'Page', placeholder: '#fdf6c3' },
    { key: 'show_deped_header', label: 'Show the DepEd header and logo', type: 'boolean', section: 'Cover' },
    { key: 'deped_header', label: 'DepEd header', type: 'textarea', section: 'Cover', rows: 2 },
    {
      key: 'region',
      label: 'Region',
      type: 'text',
      section: 'Cover',
      help: "Leave blank to print the region from the school's profile.",
    },
    { key: 'district', label: 'District', type: 'text', section: 'Cover' },
    {
      key: 'school_name',
      label: 'School name as printed',
      type: 'text',
      section: 'Cover',
      help: "Leave blank to print the school's name from Settings.",
    },
    { key: 'chapter', label: 'Chapter', type: 'text', section: 'Cover', placeholder: 'e.g. General Santos City' },
    {
      key: 'title_style',
      label: 'Card title',
      type: 'select',
      section: 'Cover',
      options: [
        { value: 'image', label: 'Colourful "Kindergarten Progress Report" artwork' },
        { value: 'text', label: 'Plain text (the wording below)' },
      ],
    },
    { key: 'card_title', label: 'Card title wording', type: 'text', section: 'Cover' },
    {
      key: 'intro',
      label: 'Note to parents',
      type: 'textarea',
      section: 'Cover',
      rows: 6,
    },
    { key: 'scale_note_title', label: 'Rating scale heading', type: 'text', section: 'Cover' },
    { key: 'scale_note', label: 'Rating scale note', type: 'textarea', section: 'Cover', rows: 4 },
    { key: 'competencies_title', label: 'Competencies heading', type: 'text', section: 'Competencies' },
    { key: 'comments_title', label: 'Remarks heading', type: 'text', section: 'Remarks' },
    { key: 'comments_hint', label: 'Line under the remarks heading', type: 'text', section: 'Remarks' },
    { key: 'show_parent_signatures', label: "Parent/Guardian's signature lines", type: 'boolean', section: 'Remarks' },
    { key: 'show_certificate', label: 'Certificate of Transfer', type: 'boolean', section: 'Back page' },
    { key: 'certificate_text', label: 'Certificate wording', type: 'textarea', section: 'Back page', rows: 2 },
  ],
}

export const REPORT_CARD_LAYOUTS: Record<ReportCardLayout, ReportCardLayoutDefinition> = {
  shs_semestral: SHS_SEMESTRAL_LAYOUT,
  kinder_trifold: KINDER_TRIFOLD_LAYOUT,
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
