import type { ReportCardSettingValue } from '../layouts'
import type { ClassSection, Institution, SchoolDay, Student, StudentAttendance, Subject } from '../../../types'
import type { StudentRunningGrade } from '../../../services/studentRunningGradeService'
import { calculateAgeAsOfOctober31, getQuarterGrade } from '../../../utils/gradeUtils'
import { formatStudentNameReportCard } from '../../../utils/reportCardPdfUtils'
import { parseGradeLevelNumber } from '../../../utils/gradeLevel'

/**
 * Everything the Senior High semestral card prints, already worked out.
 *
 * The PDF component only lays this out, so the same document draws a real
 * learner's card and the Settings preview's sample one, and the arithmetic
 * (which semester a subject is in, when a final grade exists) lives here
 * rather than inside the page markup.
 */

export interface ShsSubjectRow {
  key: string
  title: string
  /** A child subject, printed indented under its parent and not averaged. */
  isChild: boolean
  quarters: [number | null, number | null]
  final: number | null
}

export interface ShsSubjectGroup {
  /** Null when the school never grouped its subjects — no heading row. */
  label: string | null
  rows: ShsSubjectRow[]
}

export interface ShsSemester {
  label: string
  quarterLabels: [string, string]
  groups: ShsSubjectGroup[]
  generalAverage: number | null
}

export interface ShsAttendanceMonth {
  label: string
  schoolDays: number | null
  present: number | null
  absent: number | null
}

export interface ShsCoreValueRow {
  number: number
  coreValue: string
  statements: { text: string; markings: string[] }[]
}

export interface ShsCardData {
  schoolName: string
  schoolLogoUrl: string | null
  schoolYear: string
  studentName: string
  birthDate: string
  age: string
  gender: string
  lrn: string
  gradeSection: string
  teacherName: string
  principalName: string
  trackStrand: string
  semesters: [ShsSemester, ShsSemester]
  coreValues: ShsCoreValueRow[]
  attendance: ShsAttendanceMonth[]
  attendanceTotal: Omit<ShsAttendanceMonth, 'label'>
  promotedTo: string
}

/**
 * DepEd's observed values. The keys are the exact strings the Core Values tab
 * saves markings under — a reworded statement here finds no markings.
 */
export const SHS_CORE_VALUES: { coreValue: string; label: string; statements: string[] }[] = [
  {
    coreValue: 'Maka-Diyos',
    label: 'Maka-Diyos',
    statements: [
      "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others.",
      'Shows adherence to ethical principles by upholding truth',
    ],
  },
  {
    coreValue: 'Maka-Tao',
    label: 'Makatao',
    statements: [
      'Is sensitive to individual, social, and cultural differences',
      'Demonstrates contributions toward solidarity',
    ],
  },
  {
    coreValue: 'Makakalikasan',
    label: 'Makakalikasan',
    statements: ['Cares for the environment and utilizes resources wisely, judiciously, and economically.'],
  },
  {
    coreValue: 'Makabansa',
    label: 'Makabansa',
    statements: [
      'Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen',
      'Demonstrates appropriate behavior in carrying out activities in the school, community, and country',
    ],
  },
]

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

/** Month numbers from start to end, wrapping over the new year (June → April). */
export function attendanceMonths(start: number, end: number): number[] {
  const first = start >= 1 && start <= 12 ? start : 6
  const last = end >= 1 && end <= 12 ? end : 4
  const months: number[] = []
  let month = first
  for (let i = 0; i < 12; i++) {
    months.push(month)
    if (month === last) break
    month = (month % 12) + 1
  }
  return months
}

const SEMESTER_QUARTERS: [[string, string], [string, string]] = [['1', '2'], ['3', '4']]

const formatBirthDate = (value: string | null | undefined) => {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return ''
  const month = MONTH_NAMES[Number(match[2]) - 1]
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : ''
}

const formatPerson = (person: { first_name?: string; middle_name?: string; last_name?: string } | null | undefined) => {
  if (!person) return ''
  const middle = String(person.middle_name ?? '').trim()
  return [person.first_name, middle ? `${middle.charAt(0)}.` : '', person.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

const average = (values: number[]) =>
  values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)

interface BuildShsCardDataInput {
  student: Student
  institution: Institution
  classSection: ClassSection
  subjects: Subject[]
  grades: StudentRunningGrade[]
  coreValueMarkings: { core_value?: string; behavior_statement?: string; quarter?: string | number; marking?: string }[]
  attendances: StudentAttendance[]
  schoolDays: SchoolDay[]
  academicYear: string
  settings: Record<string, ReportCardSettingValue>
  schoolLogoUrl: string | null
  principalName: string
  overrideAge?: string
}

export function buildShsCardData(input: BuildShsCardDataInput): ShsCardData {
  const { student, institution, classSection, subjects, grades, settings } = input

  const gradesFor = (subjectId: string) => grades.filter((grade) => grade.subject_id === subjectId)
  const quarterGrade = (subjectGrades: StudentRunningGrade[], quarter: string) => {
    const value = getQuarterGrade(subjectGrades, quarter)
    return value > 0 ? value : null
  }

  /*
   * A subject's semester is whatever the school set on it. Left blank, it is
   * read from the grades: a subject graded only in quarters 3 and 4 is a second
   * semester one, anything else the first. A child subject follows its parent.
   */
  const semesterOf = (subject: Subject): 1 | 2 => {
    if (subject.semester === 1 || subject.semester === 2) return subject.semester
    const subjectGrades = gradesFor(subject.id)
    const firstHalf = quarterGrade(subjectGrades, '1') !== null || quarterGrade(subjectGrades, '2') !== null
    const secondHalf = quarterGrade(subjectGrades, '3') !== null || quarterGrade(subjectGrades, '4') !== null
    return secondHalf && !firstHalf ? 2 : 1
  }

  const ordered = [...subjects].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title)
  )
  const topLevel = ordered.filter((subject) => subject.subject_type !== 'child' || !subject.parent_subject_id)
  const childrenOf = (parentId: string) =>
    ordered.filter((subject) => subject.subject_type === 'child' && subject.parent_subject_id === parentId)

  // A limited subject the learner was never graded in is someone else's
  // elective, not a blank on this learner's card.
  const takes = (subject: Subject) => !subject.is_limited_student || gradesFor(subject.id).length > 0

  const titleOf = (subject: Subject) => (subject.variant ? `${subject.title} - ${subject.variant}` : subject.title)

  const rowFor = (subject: Subject, quarters: [string, string], isChild: boolean): ShsSubjectRow => {
    const subjectGrades = gradesFor(subject.id)
    const q1 = quarterGrade(subjectGrades, quarters[0])
    const q2 = quarterGrade(subjectGrades, quarters[1])
    return {
      key: subject.id,
      title: titleOf(subject),
      isChild,
      quarters: [q1, q2],
      final: q1 !== null && q2 !== null ? Math.round((q1 + q2) / 2) : null,
    }
  }

  // Groups are printed only once the school has placed at least one subject.
  const grouped = ordered.some((subject) => !!subject.report_card_category)
  const coreLabel = String(settings.core_group_label || 'Core Subjects')
  const appliedLabel = String(settings.applied_group_label || 'Applied and Specialized Subjects')

  const semesters = ([1, 2] as const).map((semester): ShsSemester => {
    const quarters = SEMESTER_QUARTERS[semester - 1]
    const inSemester = topLevel.filter((subject) => semesterOf(subject) === semester && takes(subject))

    const rowsFor = (list: Subject[]) =>
      list.flatMap((subject) => [
        rowFor(subject, quarters, false),
        ...childrenOf(subject.id).filter(takes).map((child) => rowFor(child, quarters, true)),
      ])

    const groups: ShsSubjectGroup[] = grouped
      ? [
          {
            label: coreLabel,
            rows: rowsFor(inSemester.filter((s) => s.report_card_category !== 'applied' && s.report_card_category !== 'specialized')),
          },
          {
            label: appliedLabel,
            rows: rowsFor(inSemester.filter((s) => s.report_card_category === 'applied' || s.report_card_category === 'specialized')),
          },
        ]
      : [{ label: null, rows: rowsFor(inSemester) }]

    // The general average waits for every subject's final grade, as DepEd's
    // does: an average of the subjects graded so far is not one.
    const finals = groups.flatMap((group) => group.rows.filter((row) => !row.isChild).map((row) => row.final))
    const generalAverage =
      finals.length > 0 && finals.every((final) => final !== null) ? average(finals as number[]) : null

    return {
      label: semester === 1 ? 'First Semester' : 'Second Semester',
      quarterLabels: quarters,
      groups,
      generalAverage,
    }
  }) as [ShsSemester, ShsSemester]

  // Observed values: marking per statement per quarter.
  const marking = (coreValue: string, statement: string, quarter: string) =>
    input.coreValueMarkings.find(
      (m) => m.core_value === coreValue && m.behavior_statement === statement && String(m.quarter) === quarter
    )?.marking ?? ''

  const coreValues: ShsCoreValueRow[] = SHS_CORE_VALUES.map((value, index) => ({
    number: index + 1,
    coreValue: value.label,
    statements: value.statements.map((text) => ({
      text,
      markings: ['1', '2', '3', '4'].map((quarter) => marking(value.coreValue, text, quarter)),
    })),
  }))

  // Attendance: days present are school days less days absent, as on the
  // standard card — only absences are recorded.
  const months = attendanceMonths(Number(settings.attendance_start_month), Number(settings.attendance_end_month))
  const attendance = months.map((month): ShsAttendanceMonth => {
    const schoolDays = Number(input.schoolDays.find((day) => Number(day.month) === month)?.total_days) || 0
    const absent = Number(input.attendances.find((row) => Number(row.month) === month)?.days_absent) || 0
    return {
      label: MONTH_NAMES[month - 1],
      schoolDays: schoolDays || null,
      present: schoolDays ? Math.max(0, schoolDays - absent) : null,
      absent: schoolDays || absent ? absent : null,
    }
  })
  const sum = (pick: (month: ShsAttendanceMonth) => number | null) =>
    attendance.reduce((total, month) => total + (pick(month) ?? 0), 0) || null

  const gradeNumber = parseGradeLevelNumber(classSection.grade_level)
  const gradeDisplay = gradeNumber !== null ? String(gradeNumber) : String(classSection.grade_level ?? '').trim()
  const passedBoth = semesters.every((semester) => semester.generalAverage !== null && semester.generalAverage >= 75)

  const age =
    input.overrideAge !== undefined && input.overrideAge !== ''
      ? input.overrideAge
      : student.birthdate
        ? String(calculateAgeAsOfOctober31(student.birthdate, input.academicYear))
        : ''

  const configuredName = String(settings.school_name ?? '').trim()

  return {
    schoolName: configuredName || institution.title || '',
    schoolLogoUrl: input.schoolLogoUrl,
    schoolYear: input.academicYear,
    studentName: formatStudentNameReportCard(student).toUpperCase(),
    birthDate: formatBirthDate(student.birthdate),
    age,
    gender: student.gender ? String(student.gender).toUpperCase() : '',
    lrn: String(student.lrn ?? '').trim(),
    gradeSection: [gradeDisplay, String(classSection.title ?? '').trim()].filter(Boolean).join(' - '),
    teacherName: formatPerson(classSection.adviser_user).toUpperCase(),
    principalName: input.principalName,
    trackStrand: String(classSection.strand?.title || classSection.track?.title || '').toUpperCase(),
    semesters,
    coreValues,
    attendance,
    attendanceTotal: {
      schoolDays: sum((month) => month.schoolDays),
      present: sum((month) => month.present),
      absent: attendance.some((month) => month.absent !== null) ? attendance.reduce((t, m) => t + (m.absent ?? 0), 0) : null,
    },
    // Filled in only once both semesters have a passing general average;
    // otherwise the line is left for the adviser's pen.
    promotedTo: passedBoth && gradeNumber !== null && gradeNumber < 12 ? `Grade ${gradeNumber + 1}` : '',
  }
}

/** A filled-in card for the Settings preview — no learner's data involved. */
export function sampleShsCardData(settings: Record<string, ReportCardSettingValue>, institutionName: string, logo: string | null): ShsCardData {
  const row = (title: string, q1: number, q2: number): ShsSubjectRow => ({
    key: title,
    title,
    isChild: false,
    quarters: [q1, q2],
    final: Math.round((q1 + q2) / 2),
  })
  const semester = (label: string, quarterLabels: [string, string], core: ShsSubjectRow[], applied: ShsSubjectRow[]): ShsSemester => {
    const finals = [...core, ...applied].map((r) => r.final as number)
    return {
      label,
      quarterLabels,
      groups: [
        { label: String(settings.core_group_label || 'Core Subjects'), rows: core },
        { label: String(settings.applied_group_label || 'Applied and Specialized Subjects'), rows: applied },
      ],
      generalAverage: average(finals),
    }
  }
  const months = attendanceMonths(Number(settings.attendance_start_month), Number(settings.attendance_end_month))
  const attendance = months.map((month) => ({ label: MONTH_NAMES[month - 1], schoolDays: 20, present: 20, absent: 0 }))

  return {
    schoolName: String(settings.school_name ?? '').trim() || institutionName,
    schoolLogoUrl: logo,
    schoolYear: '2025-2026',
    studentName: 'DELA CRUZ, JUAN M.',
    birthDate: 'JANUARY 7, 2009',
    age: '16',
    gender: 'MALE',
    lrn: '123456789012',
    gradeSection: '11 - HUMSS A',
    teacherName: 'MARIA L. SANTOS',
    principalName: 'JOSE P. REYES',
    trackStrand: 'HUMANITIES AND SOCIAL SCIENCES (HUMSS)',
    semesters: [
      semester(
        'First Semester',
        ['1', '2'],
        [
          row('Oral Communication in Context', 90, 91),
          row('Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino', 91, 91),
          row('Introduction to the Philosophy of the Human Person', 91, 92),
          row('Physical Education and Health 1', 92, 94),
          row('General Mathematics', 83, 85),
          row('Earth and Life Science', 90, 89),
          row('21st Century Literature from the Philippines and the World', 91, 94),
        ],
        [row('Philippine Politics and Governance', 89, 93), row('Christian Living Education', 91, 95)]
      ),
      semester(
        'Second Semester',
        ['3', '4'],
        [
          row('Reading and Writing', 95, 96),
          row('Pagbasa at Pagsusuri ng Iba’t Ibang Teksto Tungo sa Pananaliksik', 90, 91),
          row('Understanding Culture, Society and Politics', 88, 93),
          row('Physical Education and Health 2', 95, 96),
          row('Statistics and Probability', 87, 85),
          row('Physical Science', 90, 90),
        ],
        [
          row('Practical Research 1', 90, 93),
          row('Empowerment Technologies (E-Tech): ICT for Professionals', 95, 95),
          row('Disciplines and Ideas in the Social Sciences', 90, 93),
          row('Christian Living Education', 96, 97),
        ]
      ),
    ],
    coreValues: SHS_CORE_VALUES.map((value, index) => ({
      number: index + 1,
      coreValue: value.label,
      statements: value.statements.map((text) => ({ text, markings: ['AO', 'AO', 'AO', 'AO'] })),
    })),
    attendance,
    attendanceTotal: { schoolDays: 20 * months.length, present: 20 * months.length, absent: 0 },
    promotedTo: 'Grade 12',
  }
}
