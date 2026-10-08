import type {
  MatatagDescriptor,
  MatatagPaceArea,
  MatatagPaceRow,
  MatatagProgressReport,
  MatatagReportLearner,
} from '../../../types'
import { SAMPLE_KINDER_AREAS } from './sampleCatalog'

/**
 * A made-up Kindergarten learner for the Settings preview, in the exact shape
 * MATATAG Progress sends, so the preview draws the same document a real card
 * does. Nobody's ratings are in it.
 */
export function sampleKinderReport(schoolName: string): MatatagProgressReport {
  const pace: Record<string, MatatagDescriptor> = {}
  const ratings: MatatagDescriptor[] = ['CO', 'DV', 'CO', 'BG', 'CO', 'DV']

  const areas: MatatagPaceArea[] = SAMPLE_KINDER_AREAS.map((area, areaIndex) => {
    const domainTitles = [...new Set(area.rows.map(([domain]) => domain).filter((d): d is string => d !== null))]
    const domains = domainTitles.map((title, index) => ({
      id: `sample-${areaIndex}-domain-${index}`,
      code: `domain-${index}`,
      title,
      term: 0,
      sort_order: index + 1,
    }))

    const rows: MatatagPaceRow[] = area.rows.map(([domain, label, text], rowIndex) => {
      const id = `sample-${areaIndex}-${rowIndex}`
      const slots = [1, 2, 3].map(term => ({ id: `${id}-t${term}`, term, macro_skill: null, sort_order: 1 }))
      // Two terms marked, the third still to come — how a card looks mid-year.
      slots.slice(0, 2).forEach((slot, term) => {
        pace[slot.id] = ratings[(rowIndex + term + areaIndex) % ratings.length]
      })

      return {
        competency_id: id,
        path: `.${label}`,
        domain_id: domain ? `sample-${areaIndex}-domain-${domainTitles.indexOf(domain)}` : null,
        term: 0,
        number: label,
        letter: null,
        label,
        text,
        performance_standard: null,
        extra: null,
        parent_label: null,
        parent_text: null,
        slots,
      }
    })

    return {
      id: `sample-${areaIndex}`,
      key: `area-${areaIndex}`,
      title: area.title,
      shape: 'year_list',
      uses_macro_skills: false,
      has_domains: domains.length > 0,
      carries_values: false,
      sort_order: areaIndex + 1,
      domains,
      rows,
    }
  })

  const monthNames = ['June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April']
  const monthNumbers = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4]
  const classDays = [18, 22, 21, 20, 20, 19, 14, 21, 19, 20, 12]
  const months = monthNumbers.map((month, index) => ({
    term: index < 4 ? 1 : index < 7 ? 2 : 3,
    month,
    year: month >= 6 ? 2026 : 2027,
    label: monthNames[index],
    // Only the first term has happened yet.
    class_days: index < 4 ? classDays[index] : 0,
    days_present: index < 4 ? classDays[index] - (index % 2) : 0,
    days_absent: index < 4 ? index % 2 : 0,
  }))

  const learner: MatatagReportLearner = {
    student: {
      id: 'sample-learner',
      lrn: '123456789012',
      name: 'Maria Isabel Santos',
      first_name: 'Maria Isabel',
      middle_name: 'Reyes',
      last_name: 'Santos',
      ext_name: null,
      sex: 'female',
      birthdate: '2021-03-14',
      age_at_start_of_school_year: 5,
      age_at_end_of_school_year: 6,
      age_months_at_start_of_school_year: 2,
      age_months_at_end_of_school_year: 0,
    },
    narratives: [1, 2, 3].map(term => ({
      term,
      label: `Term ${term}`,
      filipino: '',
      can_do: null,
      to_improve: null,
      comments:
        term === 1
          ? 'Maria joins class activities eagerly and follows routines well. She is learning to share materials with classmates. Reading short stories together at home will help her letter sounds.'
          : null,
      updated_at: null,
    })),
    attendance: { months, terms: {}, total: { class_days: 0, days_present: 0, days_absent: 0 } },
    pace,
  }

  return {
    academic_year: '2026-2027',
    school: {
      id: null,
      name: schoolName,
      address: null,
      division: null,
      region: 'Region XII',
      school_id: null,
      logo: null,
    },
    section: { id: 'sample-section', title: 'Faith', grade_level: 'Kinder 2', adviser: { id: 'sample-adviser', name: 'Ana L. Cruz' } },
    curriculum_version: {
      id: 'sample',
      code: 'deped-kindergarten-v1',
      title: 'DepEd Kindergarten Progress Report',
      grade_level: 'Kindergarten',
      instrument: { key: 'kinder', label: null, ratings_on_card: true, descriptors: [], narratives: [] },
      source: null,
      published_on: null,
      competency_count: 60,
      slot_count: 180,
      locked: false,
    },
    legend: {
      descriptors: [
        {
          letter: 'CO',
          key: 'C',
          label: 'Consistent',
          filipino: null,
          description:
            'Always demonstrates the expected competency. Always participates in the different activities, works independently. Always performs tasks, advanced in some aspects.',
        },
        {
          letter: 'DV',
          key: 'D',
          label: 'Developing',
          filipino: null,
          description:
            'Sometimes demonstrates the competency. Sometimes participates, minimal supervision. Progresses continuously in doing assigned tasks.',
        },
        {
          letter: 'BG',
          key: 'B',
          label: 'Beginning',
          filipino: null,
          description:
            'Rarely demonstrates the expected competency. Rarely participates in class activities and/or initiates independent works. Shows interest in doing tasks but needs close supervision.',
        },
      ],
      narratives: [],
      terms: [1, 2, 3].map(value => ({ value, label: `Term ${value}`, filipino: '', months: [] })),
      macro_skills: [],
    },
    pace: { scope: 'all_areas', note: null, learning_areas: areas },
    learners: [learner],
    warnings: [],
  }
}
