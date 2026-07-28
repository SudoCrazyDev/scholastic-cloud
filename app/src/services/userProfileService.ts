import { api } from '../lib/api'

// ---- Payload shapes ---------------------------------------------------------

export interface PersonalInfo {
  place_of_birth: string
  civil_status: string
  height: string
  weight: string
  blood_type: string
  gsis_id: string
  pag_ibig_id: string
  philhealth_id: string
  sss: string
  tin: string
  agency_employee_id: string
  telephone_no: string
  mobile_no: string
}

export interface FamilyBackground {
  spouse_first_name: string
  spouse_middle_name: string
  spouse_last_name: string
  spouse_extension_name: string
  spouse_occupation: string
  spouse_employer: string
  spouse_business_address: string
  spouse_telephone: string
  father_first_name: string
  father_middle_name: string
  father_last_name: string
  father_extension_name: string
  mother_first_name: string
  mother_middle_name: string
  mother_last_name: string
  mother_extension: string
}

/** A child row. `id` is present once the row exists on the server. */
export interface ChildEntry {
  id?: string
  children_name: string
  date_of_birth: string
}

export interface EducationEntry {
  school_name: string
  degree: string
  year_graduated: string
  honors: string
}

export interface EligibilityEntry {
  eligibility_type: string
  rating: string
  date_of_exam: string
  place_of_exam: string
}

/** A work experience row. `id` is present once the row exists on the server. */
export interface WorkEntry {
  id?: string
  company_name: string
  position: string
  start_date: string
  end_date: string
  duties: string
}

export interface LearningEntry {
  title: string
  date_from: string
  date_to: string
  number_of_hours: string
  type_of_ld: string
  conducted_by: string
}

// ---- Helpers ----------------------------------------------------------------

const isNotFound = (error: any) => error?.response?.status === 404

/** These endpoints 404 until the user has saved once; treat that as "empty". */
async function getOrNull<T>(url: string): Promise<T | null> {
  try {
    const response = await api.get<T>(url)
    return response.data
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

/** One-to-one resources have no upsert route, so fall back to POST on 404. */
async function putOrPost<T>(url: string, payload: unknown): Promise<T> {
  try {
    const response = await api.put<T>(url, payload)
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      const response = await api.post<T>(url, payload)
      return response.data
    }
    throw error
  }
}

/** `date` casts come back as ISO timestamps; `<input type="date">` needs yyyy-mm-dd. */
const toDateInput = (value: unknown): string =>
  typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : ''

/** Blank date inputs must be sent as null — Laravel's `date` rule rejects "". */
const toDatePayload = (value: string): string | null => value.trim() || null

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const str = (value: unknown): string => (value == null ? '' : String(value))

/** Server rows carry nulls and extra keys; keep our field set and blank the nulls. */
function fill<T extends object>(template: T, source: unknown): T {
  const row = (source ?? {}) as Record<string, unknown>
  const result = { ...template } as Record<string, unknown>
  for (const key of Object.keys(template)) {
    result[key] = str(row[key])
  }
  return result as T
}

export const EMPTY_PERSONAL_INFO: PersonalInfo = {
  place_of_birth: '',
  civil_status: '',
  height: '',
  weight: '',
  blood_type: '',
  gsis_id: '',
  pag_ibig_id: '',
  philhealth_id: '',
  sss: '',
  tin: '',
  agency_employee_id: '',
  telephone_no: '',
  mobile_no: '',
}

export const EMPTY_FAMILY_BACKGROUND: FamilyBackground = {
  spouse_first_name: '',
  spouse_middle_name: '',
  spouse_last_name: '',
  spouse_extension_name: '',
  spouse_occupation: '',
  spouse_employer: '',
  spouse_business_address: '',
  spouse_telephone: '',
  father_first_name: '',
  father_middle_name: '',
  father_last_name: '',
  father_extension_name: '',
  mother_first_name: '',
  mother_middle_name: '',
  mother_last_name: '',
  mother_extension: '',
}

export const EMPTY_CHILD: ChildEntry = { children_name: '', date_of_birth: '' }

export const EMPTY_EDUCATION: EducationEntry = {
  school_name: '',
  degree: '',
  year_graduated: '',
  honors: '',
}

export const EMPTY_ELIGIBILITY: EligibilityEntry = {
  eligibility_type: '',
  rating: '',
  date_of_exam: '',
  place_of_exam: '',
}

export const EMPTY_WORK: WorkEntry = {
  company_name: '',
  position: '',
  start_date: '',
  end_date: '',
  duties: '',
}

export const EMPTY_LEARNING: LearningEntry = {
  title: '',
  date_from: '',
  date_to: '',
  number_of_hours: '',
  type_of_ld: '',
  conducted_by: '',
}

export interface UserProfileData {
  personal: PersonalInfo
  family: FamilyBackground
  children: ChildEntry[]
  education: EducationEntry[]
  eligibilityRecordId: string | null
  eligibility: EligibilityEntry[]
  work: WorkEntry[]
  learning: LearningEntry[]
}

/**
 * Reconciles a list of rows against what the server already has:
 * deletes what disappeared, updates what stayed, creates what is new.
 */
async function syncRows<T extends { id?: string }>(
  serverRows: T[],
  localRows: T[],
  ops: {
    create: (row: T) => Promise<unknown>
    update: (id: string, row: T) => Promise<unknown>
    remove: (id: string) => Promise<unknown>
  }
) {
  const keptIds = new Set(localRows.map((row) => row.id).filter(Boolean) as string[])

  await Promise.all(
    serverRows
      .filter((row) => row.id && !keptIds.has(row.id))
      .map((row) => ops.remove(row.id as string))
  )

  await Promise.all(
    localRows.map((row) => (row.id ? ops.update(row.id, row) : ops.create(row)))
  )
}

// ---- Service ----------------------------------------------------------------

class UserProfileService {
  // -- Personal info (one-to-one) --------------------------------------------

  async getPersonalInfo(): Promise<PersonalInfo> {
    const record = await getOrNull<unknown>('/user-other-personal-info')
    return fill(EMPTY_PERSONAL_INFO, record)
  }

  async savePersonalInfo(data: PersonalInfo) {
    return putOrPost('/user-other-personal-info', data)
  }

  // -- Family background (one-to-one) ----------------------------------------

  async getFamilyBackground(): Promise<FamilyBackground> {
    const record = await getOrNull<unknown>('/user-family')
    return fill(EMPTY_FAMILY_BACKGROUND, record)
  }

  async saveFamilyBackground(data: FamilyBackground) {
    return putOrPost('/user-family', data)
  }

  // -- Children (row per record) ---------------------------------------------

  async getChildren(): Promise<ChildEntry[]> {
    const rows = (await getOrNull<any[]>('/user-childrens')) ?? []
    return asArray<any>(rows).map((row) => ({
      id: row.id,
      children_name: str(row.children_name),
      date_of_birth: toDateInput(row.date_of_birth),
    }))
  }

  async saveChildren(serverRows: ChildEntry[], localRows: ChildEntry[]) {
    const payload = (row: ChildEntry) => ({
      children_name: row.children_name.trim(),
      date_of_birth: toDatePayload(row.date_of_birth),
    })
    await syncRows(serverRows, localRows, {
      create: (row) => api.post('/user-childrens', payload(row)),
      update: (id, row) => api.put(`/user-childrens/${id}`, payload(row)),
      remove: (id) => api.delete(`/user-childrens/${id}`),
    })
  }

  // -- Educational background (one-to-one, JSON list) ------------------------

  async getEducation(): Promise<EducationEntry[]> {
    const record = await getOrNull<any>('/user-educational-background')
    return asArray<any>(record?.data?.educ_details).map((row) => ({
      school_name: str(row.school_name),
      degree: str(row.degree),
      year_graduated: str(row.year_graduated),
      honors: str(row.honors),
    }))
  }

  async saveEducation(entries: EducationEntry[]) {
    return putOrPost('/user-educational-background', { educ_details: entries })
  }

  // -- Civil service eligibility (one-to-one, JSON list) ---------------------

  async getEligibility(): Promise<{ recordId: string | null; entries: EligibilityEntry[] }> {
    const rows = (await getOrNull<any[]>('/user-civil-service-eligibility')) ?? []
    const record = asArray<any>(rows)[0]
    if (!record) return { recordId: null, entries: [] }
    return {
      recordId: record.id,
      entries: asArray<any>(record.details).map((row) => ({
        eligibility_type: str(row.eligibility_type),
        rating: str(row.rating),
        date_of_exam: toDateInput(row.date_of_exam),
        place_of_exam: str(row.place_of_exam),
      })),
    }
  }

  async saveEligibility(recordId: string | null, entries: EligibilityEntry[]) {
    if (recordId) {
      const response = await api.put(`/user-civil-service-eligibility/${recordId}`, {
        details: entries,
      })
      return response.data
    }
    const response = await api.post('/user-civil-service-eligibility', { details: entries })
    return response.data
  }

  // -- Work experience (row per record, JSON body) ---------------------------

  async getWorkExperience(): Promise<WorkEntry[]> {
    const response = await getOrNull<any>('/user-work-experience')
    return asArray<any>(response?.data).map((row) => ({
      id: row.id,
      company_name: str(row.work_details?.company_name),
      position: str(row.work_details?.position),
      start_date: toDateInput(row.work_details?.start_date),
      end_date: toDateInput(row.work_details?.end_date),
      duties: str(row.work_details?.duties),
    }))
  }

  async saveWorkExperience(serverRows: WorkEntry[], localRows: WorkEntry[]) {
    const payload = (row: WorkEntry) => ({
      work_details: {
        company_name: row.company_name,
        position: row.position,
        start_date: row.start_date,
        end_date: row.end_date,
        duties: row.duties,
      },
    })
    await syncRows(serverRows, localRows, {
      create: (row) => api.post('/user-work-experience', payload(row)),
      update: (id, row) => api.put(`/user-work-experience/${id}`, payload(row)),
      remove: (id) => api.delete(`/user-work-experience/${id}`),
    })
  }

  // -- Learning & development (one-to-one, JSON list) ------------------------

  async getLearningDevelopment(): Promise<LearningEntry[]> {
    const record = await getOrNull<any>('/user-learning-development')
    return asArray<any>(record?.development_details).map((row) => ({
      title: str(row.title),
      date_from: toDateInput(row.date_from),
      date_to: toDateInput(row.date_to),
      number_of_hours: str(row.number_of_hours),
      type_of_ld: str(row.type_of_ld),
      conducted_by: str(row.conducted_by),
    }))
  }

  async saveLearningDevelopment(entries: LearningEntry[]) {
    return putOrPost('/user-learning-development', { development_details: entries })
  }

  // -- Whole sheet ------------------------------------------------------------

  async loadAll(): Promise<UserProfileData> {
    const [personal, family, children, education, eligibility, work, learning] = await Promise.all([
      this.getPersonalInfo(),
      this.getFamilyBackground(),
      this.getChildren(),
      this.getEducation(),
      this.getEligibility(),
      this.getWorkExperience(),
      this.getLearningDevelopment(),
    ])
    return {
      personal,
      family,
      children,
      education,
      eligibilityRecordId: eligibility.recordId,
      eligibility: eligibility.entries,
      work,
      learning,
    }
  }
}

export const userProfileService = new UserProfileService()
