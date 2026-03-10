/**
 * Form Builder types: Student model attributes and general (non-model) components.
 */

/** Student model attribute keys – map to form fields with known types. */
export type StudentFieldKey =
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'ext_name'
  | 'lrn'
  | 'gender'
  | 'religion'
  | 'birthdate'
  | 'profile_picture'
  | 'is_active'

/** General component types (no model relation). */
export type GeneralComponentType =
  | 'text_input'
  | 'text_editor'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime'
  | 'checkbox'
  | 'select'
  | 'file_upload'
  | 'heading'
  | 'paragraph'
  | 'divider'

/** Single form field placed on the canvas. */
export interface FormBuilderField {
  id: string
  /** 1 = left column, 2 = right column (when two-column layout is on). */
  column: 1 | 2
  /** Student model field – binds to Student attribute. */
  studentField?: StudentFieldKey
  /** General component – no model binding. */
  generalType?: GeneralComponentType
  /** Optional custom label (overrides default for student fields). */
  label?: string
  /** Optional placeholder for text inputs. */
  placeholder?: string
  /** For select: options as "value,label" or JSON. */
  options?: string
}

/** Form builder draft state. */
export interface FormBuilderDraft {
  title: string
  twoColumnLayout: boolean
  fields: FormBuilderField[]
}

export const STUDENT_FIELD_LABELS: Record<StudentFieldKey, string> = {
  first_name: 'First Name',
  middle_name: 'Middle Name',
  last_name: 'Last Name',
  ext_name: 'Extension Name',
  lrn: 'LRN (Learner Reference Number)',
  gender: 'Gender',
  religion: 'Religion',
  birthdate: 'Birthdate',
  profile_picture: 'Profile Picture',
  is_active: 'Active',
}

export const GENERAL_COMPONENT_LABELS: Record<GeneralComponentType, string> = {
  text_input: 'Text Input',
  text_editor: 'Text Editor',
  number: 'Number',
  date: 'Date',
  time: 'Time',
  datetime: 'Date & Time',
  checkbox: 'Checkbox',
  select: 'Select',
  file_upload: 'File Upload',
  heading: 'Heading',
  paragraph: 'Paragraph',
  divider: 'Divider',
}
