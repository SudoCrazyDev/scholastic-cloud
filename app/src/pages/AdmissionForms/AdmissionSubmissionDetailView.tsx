import type { ReactNode } from 'react'
import type { AdmissionFormPayload, AdmissionHealthBlock } from '../../types'

function dash(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return '—'
  const s = String(v).trim()
  return s.length ? s : '—'
}

function yesNo(v: boolean | undefined): string {
  if (v === undefined) return '—'
  return v ? 'Yes' : 'No'
}

function formatGender(g: string | undefined): string {
  if (!g?.trim()) return '—'
  const m: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    others: 'Others',
  }
  return m[g.toLowerCase()] ?? g
}

const HEALTH_LABELS: Record<keyof AdmissionFormPayload['health_information'], string> = {
  had_chicken_pox: 'Had chicken pox?',
  had_chicken_pox_vaccine: 'Had chicken pox vaccine?',
  hospitalization_past_year: 'Hospitalization in the past year?',
  chronic_condition: 'Chronic condition?',
  allergies: 'Allergies?',
  other_medical_problems: 'Other medical problems?',
}

function HealthBlockReadonly({ title, block }: { title: string; block: AdmissionHealthBlock }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-sm text-gray-700 mt-1">
        <span className="text-gray-500">Answer: </span>
        {yesNo(block.answer)}
      </p>
      {block.answer && block.when?.trim() ? (
        <p className="text-sm text-gray-700 mt-1">
          <span className="text-gray-500">When / details: </span>
          {block.when}
        </p>
      ) : null}
      {block.answer && block.details?.trim() ? (
        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
          <span className="text-gray-500">Details: </span>
          {block.details}
        </p>
      ) : null}
    </div>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-2 sm:py-2.5 border-b border-gray-100 last:border-b-0">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap break-words">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-1">{title}</h3>
      <div className="divide-y divide-gray-100">{children}</div>
    </section>
  )
}

export function AdmissionSubmissionDetailView({ payload }: { payload: AdmissionFormPayload }) {
  const g = payload.general_information
  const f = payload.family_information
  const e = payload.emergency_contact
  const h = payload.health_information
  const a = payload.agreement

  return (
    <div className="space-y-1 text-sm">
      <Section title="Program">
        <Field label="Applying for grade level" value={dash(payload.grade_level)} />
      </Section>

      <Section title="General information">
        <div className="grid sm:grid-cols-2 gap-x-6">
          <Field label="Last name" value={dash(g.surname)} />
          <Field label="First name" value={dash(g.first_name)} />
          <Field label="Middle name" value={dash(g.middle_name)} />
          <Field label="Full name" value={dash(g.full_name)} />
          <Field label="Mobile number" value={dash(g.mobile_number)} />
          <Field label="Birthdate" value={dash(g.birthdate)} />
          <Field label="Age" value={g.age !== undefined && g.age !== null ? String(g.age) : '—'} />
          <Field label="Gender" value={formatGender(g.gender)} />
          <Field label="Place of birth" value={dash(g.place_of_birth)} />
          <Field label="Religion" value={dash(g.religion)} />
          <Field label="Mother tongue" value={dash(g.mother_tongue)} />
          <Field label="LRN" value={dash(g.lrn)} />
          <Field label="School year" value={dash(g.school_year)} />
          <Field label="Last school attended" value={dash(g.last_school_attended)} />
        </div>
        <Field label="Complete address" value={dash(g.complete_address)} />
        {g.school_address?.trim() ? <Field label="School address" value={dash(g.school_address)} /> : null}
      </Section>

      <Section title="Family information">
        <p className="text-xs font-semibold text-gray-700 pt-2 pb-1">Father</p>
        <div className="grid sm:grid-cols-3 gap-x-6">
          <Field label="Name" value={dash(f.father.name)} />
          <Field label="Age" value={f.father.age !== undefined && f.father.age !== null ? String(f.father.age) : '—'} />
          <Field label="Occupation" value={dash(f.father.occupation)} />
        </div>
        <p className="text-xs font-semibold text-gray-700 pt-3 pb-1">Mother</p>
        <div className="grid sm:grid-cols-3 gap-x-6">
          <Field label="Name" value={dash(f.mother.name)} />
          <Field label="Age" value={f.mother.age !== undefined && f.mother.age !== null ? String(f.mother.age) : '—'} />
          <Field label="Occupation" value={dash(f.mother.occupation)} />
        </div>
        <p className="text-xs font-semibold text-gray-700 pt-3 pb-1">Siblings</p>
        <div className="grid sm:grid-cols-2 gap-x-6">
          <Field
            label="Brothers (count)"
            value={
              f.siblings.brothers !== undefined && f.siblings.brothers !== null
                ? String(f.siblings.brothers)
                : '—'
            }
          />
          <Field
            label="Sisters (count)"
            value={
              f.siblings.sisters !== undefined && f.siblings.sisters !== null
                ? String(f.siblings.sisters)
                : '—'
            }
          />
        </div>
      </Section>

      <Section title="Emergency contact">
        <div className="grid sm:grid-cols-2 gap-x-6">
          <Field label="Name" value={dash(e.name)} />
          <Field label="Relationship" value={dash(e.relationship)} />
          <Field label="Age" value={e.age !== undefined && e.age !== null ? String(e.age) : '—'} />
          <Field label="Contact number" value={dash(e.contact_number)} />
        </div>
        <Field label="Address" value={dash(e.address)} />
      </Section>

      <Section title="Health information">
        <div className="space-y-3 pt-1">
          {(Object.keys(HEALTH_LABELS) as (keyof typeof HEALTH_LABELS)[]).map((key) => (
            <HealthBlockReadonly key={key} title={HEALTH_LABELS[key]} block={h[key]} />
          ))}
        </div>
      </Section>

      <Section title="Agreement & privacy">
        <Field label="School policies accepted" value={yesNo(a.school_policies_accepted)} />
        <Field label="Privacy policy read (at submit)" value={yesNo(a.privacy_read_policy)} />
        <Field label="Privacy consent given (at submit)" value={yesNo(a.privacy_consent_given)} />
      </Section>
    </div>
  )
}
