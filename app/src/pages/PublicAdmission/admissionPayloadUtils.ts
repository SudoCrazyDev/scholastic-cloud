import type { AdmissionFormPayload } from '../../types'

export const SCHOOL_YEAR_FIXED = '2026-2027'

export function formatFullName(surname: string, first: string, middle: string): string {
  const up = (s: string) => s?.trim().toUpperCase() || ''
  const parts = [up(surname), up(first), up(middle)].filter(Boolean)
  return parts.join(', ')
}

export function sanitizeAdmissionPayload(
  v: AdmissionFormPayload & { institution_id: string },
): AdmissionFormPayload & { institution_id: string } {
  const num = (x: unknown) =>
    x === '' || x === undefined || x === null ? undefined : Number(x)
  const intOrUndef = (x: unknown) =>
    x === '' || x === undefined || x === null ? undefined : parseInt(String(x), 10)

  const gi = {
    ...v.general_information,
    age: num(v.general_information.age),
    full_name: formatFullName(
      v.general_information.surname,
      v.general_information.first_name,
      v.general_information.middle_name ?? '',
    ),
    school_year: SCHOOL_YEAR_FIXED,
    school_address: v.general_information.school_address ?? '',
  }
  const fi = {
    ...v.family_information,
    father: {
      ...v.family_information.father,
      age: num(v.family_information.father.age),
    },
    mother: {
      ...v.family_information.mother,
      age: num(v.family_information.mother.age),
    },
    siblings: {
      brothers: intOrUndef(v.family_information.siblings.brothers),
      sisters: intOrUndef(v.family_information.siblings.sisters),
    },
  }
  const ec = {
    ...v.emergency_contact,
    age: num(v.emergency_contact.age),
  }

  const hi = { ...v.health_information }
  ;(Object.keys(hi) as (keyof typeof hi)[]).forEach((k) => {
    const block = hi[k]
    hi[k] = {
      ...block,
      answer: !!block.answer,
    }
  })

  return {
    institution_id: v.institution_id,
    grade_level: v.grade_level,
    general_information: gi,
    family_information: fi,
    emergency_contact: ec,
    health_information: hi,
    agreement: {
      school_policies_accepted: !!v.agreement.school_policies_accepted,
      privacy_read_policy: !!v.agreement.privacy_read_policy,
      privacy_consent_given: !!v.agreement.privacy_consent_given,
    },
  }
}
