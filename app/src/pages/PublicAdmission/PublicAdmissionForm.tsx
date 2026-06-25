import { useMemo, useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Formik, Form, Field, ErrorMessage, useFormikContext, useField } from 'formik'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Check, CheckCircle2, Lock } from 'lucide-react'
import { admissionFormService } from '../../services/admissionFormService'
import { api } from '../../lib/api'
import { Select } from '../../components/select'
import { Switch, SwitchField } from '../../components/switch'
import { DataPrivacyConsentModal } from './DataPrivacyConsentModal'
import { formatFullName, sanitizeAdmissionPayload, SCHOOL_YEAR_FIXED } from './admissionPayloadUtils'
import type { AdmissionFormPayload, GradeLevel } from '../../types'

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'others', label: 'Others' },
]

const FALLBACK_GRADE_OPTIONS = [
  { value: 'Nursery', label: 'Nursery' },
  { value: 'Kinder', label: 'Kinder' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: `Grade ${i + 1}`,
    label: `Grade ${i + 1}`,
  })),
  { value: 'Senior High School', label: 'Senior High School' },
]

const STEPS = [
  { title: 'Program', subtitle: 'Grade level' },
  { title: 'Personal', subtitle: 'Your information' },
  { title: 'Family', subtitle: 'Parents & siblings' },
  { title: 'Emergency', subtitle: 'Contact person' },
  { title: 'Health', subtitle: 'Medical information' },
  { title: 'Agreement', subtitle: 'Review & sign' },
] as const

const LAST_STEP = STEPS.length - 1

function computeAgeFromBirthdate(birthdate: string): number | undefined {
  if (!birthdate) return undefined
  const d = new Date(birthdate + (birthdate.length === 10 ? 'T12:00:00' : ''))
  if (Number.isNaN(d.getTime())) return undefined
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1
  return age >= 0 && age < 130 ? age : undefined
}

function buildInitialValues(): AdmissionFormPayload {
  const blankHealth = { answer: false, when: '', details: '' }
  return {
    grade_level: '',
    general_information: {
      surname: '',
      first_name: '',
      middle_name: '',
      full_name: '',
      complete_address: '',
      mobile_number: '',
      birthdate: '',
      place_of_birth: '',
      religion: '',
      gender: '',
      age: undefined,
      mother_tongue: '',
      last_school_attended: '',
      school_year: SCHOOL_YEAR_FIXED,
      school_address: '',
      lrn: '',
    },
    family_information: {
      father: { name: '', age: undefined, occupation: '' },
      mother: { name: '', age: undefined, occupation: '' },
      siblings: { brothers: 0, sisters: 0 },
    },
    emergency_contact: {
      name: '',
      address: '',
      relationship: '',
      age: undefined,
      contact_number: '',
    },
    health_information: {
      had_chicken_pox: { ...blankHealth },
      had_chicken_pox_vaccine: { ...blankHealth },
      hospitalization_past_year: { ...blankHealth },
      chronic_condition: { ...blankHealth },
      allergies: { ...blankHealth },
      other_medical_problems: { ...blankHealth },
    },
    agreement: {
      school_policies_accepted: false,
      privacy_read_policy: false,
      privacy_consent_given: false,
    },
  }
}

const inputClass =
  'w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600'

const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function validateStep(stepIdx: number, values: AdmissionFormPayload): string | null {
  if (stepIdx === 0) {
    if (!values.grade_level?.trim()) return 'Please select a grade level.'
  }
  if (stepIdx === 1) {
    const g = values.general_information
    if (!g.surname?.trim()) return 'Last name is required.'
    if (!g.first_name?.trim()) return 'First name is required.'
    if (!g.complete_address?.trim()) return 'Complete address is required.'
    if (!g.mobile_number?.trim()) return 'Mobile number is required.'
    if (!g.birthdate?.trim()) return 'Birthdate is required.'
    if (!g.gender?.trim()) return 'Please select gender.'
  }
  if (stepIdx === 3) {
    const e = values.emergency_contact
    if (!e.name?.trim()) return 'Emergency contact name is required.'
    if (!e.contact_number?.trim()) return 'Emergency contact number is required.'
  }
  if (stepIdx === LAST_STEP) {
    if (!values.agreement.school_policies_accepted) {
      return 'Please accept the school agreement to continue.'
    }
  }
  return null
}

type PublicInstitution = {
  title: string
  abbr?: string | null
  address?: string | null
  logo_url?: string | null
  admission_form_open?: boolean
}

function InstitutionLogo({
  title,
  logoUrl,
  className,
}: {
  title: string
  logoUrl: string | null | undefined
  className?: string
}) {
  if (!logoUrl?.trim()) return null
  return (
    <div className={clsx('flex justify-center', className)}>
      <img
        src={logoUrl}
        alt={`${title} logo`}
        className="max-h-24 max-w-[min(100%,280px)] w-auto object-contain object-center"
        loading="eager"
        decoding="async"
      />
    </div>
  )
}

function AdmissionThankYou({ institution }: { institution: PublicInstitution }) {
  return (
    <div className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg shadow-indigo-950/5 ring-1 ring-slate-200/80 p-8 md:p-10 text-center">
      <InstitutionLogo title={institution.title} logoUrl={institution.logo_url} className="mb-6" />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-6">
        <CheckCircle2 className="h-9 w-9" strokeWidth={2} aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-3">Thank you</h1>
      <p className="text-slate-600 text-base leading-relaxed max-w-md mx-auto mb-6">
        Your application has been received. We will review your application and contact you soon.
      </p>
      <p className="text-sm text-slate-500">
        {institution.title}
        {institution.abbr ? ` (${institution.abbr})` : ''}
      </p>
      {institution.address ? <p className="mt-2 text-sm text-slate-400">{institution.address}</p> : null}
    </div>
  )
}

function AdmissionClosed({ institution }: { institution: PublicInstitution }) {
  return (
    <div className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg shadow-indigo-950/5 ring-1 ring-slate-200/80 p-8 md:p-10 text-center">
      <InstitutionLogo title={institution.title} logoUrl={institution.logo_url} className="mb-6" />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-6">
        <Lock className="h-8 w-8" strokeWidth={2} aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-3">Admissions are closed</h1>
      <p className="text-slate-600 text-base leading-relaxed max-w-md mx-auto mb-6">
        This admission form is not currently accepting applications. Please contact the school for more information.
      </p>
      <p className="text-sm text-slate-500">
        {institution.title}
        {institution.abbr ? ` (${institution.abbr})` : ''}
      </p>
      {institution.address ? <p className="mt-2 text-sm text-slate-400">{institution.address}</p> : null}
    </div>
  )
}

function PublicAdmissionForm() {
  const { institutionId } = useParams<{ institutionId: string }>()
  const [step, setStep] = useState(0)
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const { data: instRes, isLoading, isError } = useQuery({
    queryKey: ['public-institution', institutionId],
    queryFn: () => admissionFormService.getPublicInstitution(institutionId!),
    enabled: !!institutionId,
  })

  const { data: gradeLevels } = useQuery({
    queryKey: ['public-grade-levels'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GradeLevel[] }>('/public/grade-levels')
      return res.data.data ?? []
    },
    staleTime: 10 * 60 * 1000,
  })

  const gradeSelectOptions = useMemo(() => {
    if (gradeLevels && gradeLevels.length > 0) {
      return gradeLevels.map((gl) => ({ value: gl.title, label: gl.title }))
    }
    return FALLBACK_GRADE_OPTIONS
  }, [gradeLevels])

  const initialValues = useMemo(() => buildInitialValues(), [])

  const mutation = useMutation({
    mutationFn: (payload: AdmissionFormPayload & { institution_id: string }) =>
      admissionFormService.submitPublic(sanitizeAdmissionPayload(payload)),
    onSuccess: () => {
      toast.success('Admission form submitted successfully.')
      setSubmitted(true)
      setPrivacyModalOpen(false)
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      const errors = ax.response?.data?.errors
      if (errors && typeof errors === 'object') {
        const firstKey = Object.keys(errors)[0]
        const first = firstKey ? errors[firstKey]?.[0] : undefined
        toast.error(first || ax.response?.data?.message || 'Validation failed.')
        return
      }
      toast.error(ax.response?.data?.message || 'Submission failed.')
    },
  })

  if (!institutionId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-slate-50 via-indigo-50/40 to-violet-100/50">
        <p className="text-slate-600">
          Missing institution in URL. Use{' '}
          <code className="bg-white/80 px-1.5 py-0.5 rounded border border-slate-200 text-sm">/admission/&lt;institution-id&gt;</code>
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 via-indigo-50/40 to-violet-100/50">
        <p className="text-slate-600">Loading…</p>
      </div>
    )
  }

  if (isError || !instRes?.success || !instRes.data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-slate-50 via-indigo-50/40 to-violet-100/50">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Institution not found</h1>
          <p className="text-slate-600 mb-4">Check that the link includes a valid institution ID.</p>
          <Link to="/login" className="text-indigo-600 text-sm font-medium hover:underline">
            Go to login
          </Link>
        </div>
      </div>
    )
  }

  const institution = instRes.data

  if (institution.admission_form_open === false && !submitted) {
    return (
      <div
        className="min-h-screen py-8 px-4 bg-gradient-to-b from-slate-50 via-indigo-50/35 to-violet-100/45 flex flex-col items-center justify-center"
        style={{
          backgroundImage: `
          radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.12), transparent),
          radial-gradient(ellipse 60% 40% at 100% 50%, rgba(139, 92, 246, 0.08), transparent),
          radial-gradient(ellipse 50% 30% at 0% 80%, rgba(59, 130, 246, 0.06), transparent)
        `,
        }}
      >
        <div className="w-full max-w-lg mx-auto px-2">
          <AdmissionClosed institution={institution} />
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div
        className="min-h-screen py-8 px-4 bg-gradient-to-b from-slate-50 via-indigo-50/35 to-violet-100/45 flex flex-col items-center justify-center"
        style={{
          backgroundImage: `
          radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.12), transparent),
          radial-gradient(ellipse 60% 40% at 100% 50%, rgba(139, 92, 246, 0.08), transparent),
          radial-gradient(ellipse 50% 30% at 0% 80%, rgba(59, 130, 246, 0.06), transparent)
        `,
        }}
      >
        <div className="w-full max-w-lg mx-auto px-2">
          <AdmissionThankYou institution={institution} />
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen py-8 px-4 bg-gradient-to-b from-slate-50 via-indigo-50/35 to-violet-100/45"
      style={{
        backgroundImage: `
          radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.12), transparent),
          radial-gradient(ellipse 60% 40% at 100% 50%, rgba(139, 92, 246, 0.08), transparent),
          radial-gradient(ellipse 50% 30% at 0% 80%, rgba(59, 130, 246, 0.06), transparent)
        `,
      }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg shadow-indigo-950/5 ring-1 ring-slate-200/80 p-6 md:p-8 mb-6">
          <InstitutionLogo title={institution.title} logoUrl={institution.logo_url} className="mb-5" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admission Form</h1>
          <p className="mt-1 text-slate-600">
            {institution.title}
            {institution.abbr ? ` (${institution.abbr})` : ''}
          </p>
          {institution.address ? <p className="mt-2 text-sm text-slate-500">{institution.address}</p> : null}
        </div>

        <Formik initialValues={initialValues} onSubmit={() => {}}>
          <>
            <AdmissionFormInner
              step={step}
              setStep={setStep}
              gradeSelectOptions={gradeSelectOptions}
              mutationPending={mutation.isPending}
              onOpenPrivacyModal={() => setPrivacyModalOpen(true)}
            />
            <DataPrivacyConsentModal
              open={privacyModalOpen}
              onClose={() => setPrivacyModalOpen(false)}
              institutionId={institutionId}
              institutionTitle={institution.title}
              mutation={mutation}
            />
          </>
        </Formik>
      </div>
    </div>
  )
}

function AdmissionFormInner({
  step,
  setStep,
  gradeSelectOptions,
  mutationPending,
  onOpenPrivacyModal,
}: {
  step: number
  setStep: (n: number) => void
  gradeSelectOptions: { value: string; label: string }[]
  mutationPending: boolean
  onOpenPrivacyModal: () => void
}) {
  const formik = useFormikContext<AdmissionFormPayload>()

  useEffect(() => {
    const gi = formik.values.general_information
    const full = formatFullName(gi.surname, gi.first_name, gi.middle_name ?? '')
    if (gi.full_name !== full) {
      void formik.setFieldValue('general_information.full_name', full)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync derived full name only when name parts change
  }, [formik.values.general_information.surname, formik.values.general_information.first_name, formik.values.general_information.middle_name])

  useEffect(() => {
    const bd = formik.values.general_information.birthdate
    const age = computeAgeFromBirthdate(bd)
    const current = formik.values.general_information.age
    if (age !== current) {
      void formik.setFieldValue('general_information.age', age)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync age only when birthdate changes
  }, [formik.values.general_information.birthdate])

  const goNext = () => {
    const err = validateStep(step, formik.values)
    if (err) {
      toast.error(err)
      return
    }
    setStep(Math.min(step + 1, LAST_STEP))
  }

  const goBack = () => setStep(Math.max(0, step - 1))

  return (
    <Form className="space-y-6">
      <StepperHeader step={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="rounded-2xl bg-white/95 backdrop-blur-sm shadow-md shadow-slate-900/5 ring-1 ring-slate-200/90 p-6 md:p-8"
        >
          {step === 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">
                {STEPS[0].title}
              </h2>
              <p className="text-sm text-slate-500 mb-4">{STEPS[0].subtitle}</p>
              <label className={labelClass} htmlFor="grade_level">
                Applying for grade level *
              </label>
              <Field name="grade_level">
                {({ field, form }: { field: { name: string; value: string; onBlur: () => void }; form: typeof formik }) => (
                  <Select
                    name={field.name}
                    value={field.value}
                    onChange={(e) => form.setFieldValue('grade_level', e.target.value)}
                    onBlur={field.onBlur}
                    options={gradeSelectOptions}
                    placeholder="Select grade level"
                  />
                )}
              </Field>
              <ErrorMessage name="grade_level" component="p" className="text-red-600 text-sm mt-1" />
            </div>
          )}

          {step === 1 && <StepGeneral />}

          {step === 2 && <StepFamily />}

          {step === 3 && <StepEmergency />}

          {step === 4 && <StepHealth />}

          {step === 5 && <StepAgreement />}
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3 pb-8">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0 || mutationPending}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
        >
          Back
        </button>
        <div className="flex gap-3 justify-end">
          {step < LAST_STEP ? (
            <button
              type="button"
              onClick={goNext}
              disabled={mutationPending}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const err = validateStep(LAST_STEP, formik.values)
                if (err) {
                  toast.error(err)
                  return
                }
                onOpenPrivacyModal()
              }}
              disabled={mutationPending}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-50"
            >
              Submit application
            </button>
          )}
        </div>
      </div>
    </Form>
  )
}

function StepperHeader({ step }: { step: number }) {
  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur-sm ring-1 ring-slate-200/80 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          Step {step + 1} of {STEPS.length}
        </span>
        <span className="text-sm font-medium text-slate-700">{STEPS[step]?.title}</span>
      </div>
      <div className="flex gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className={clsx(
              'h-1.5 flex-1 rounded-full transition-all duration-300',
              i < step ? 'bg-indigo-500' : i === step ? 'bg-indigo-400' : 'bg-slate-200',
            )}
            title={s.title}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{STEPS[step]?.subtitle}</p>
    </div>
  )
}

function StepGeneral() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">General information</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="gi_surname">
            Last name *
          </label>
          <Field id="gi_surname" name="general_information.surname" className={inputClass} autoComplete="family-name" />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_first">
            First name *
          </label>
          <Field id="gi_first" name="general_information.first_name" className={inputClass} autoComplete="given-name" />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_mid">
            Middle name
          </label>
          <Field id="gi_mid" name="general_information.middle_name" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_full">
            Full name
          </label>
          <Field
            id="gi_full"
            name="general_information.full_name"
            className={inputClass}
            readOnly
            disabled
          />
          <p className="mt-1 text-xs text-slate-500">Auto-filled in the format LAST NAME, FIRST NAME, MIDDLE NAME</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_mobile">
            Mobile number *
          </label>
          <Field id="gi_mobile" name="general_information.mobile_number" className={inputClass} type="tel" />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_bday">
            Birthdate *
          </label>
          <Field id="gi_bday" name="general_information.birthdate" className={inputClass} type="date" />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_age">
            Age
          </label>
          <Field
            id="gi_age"
            name="general_information.age"
            type="number"
            className={inputClass}
            readOnly
            disabled
          />
          <p className="mt-1 text-xs text-slate-500">Calculated from birthdate</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_gender">
            Gender *
          </label>
          <Field name="general_information.gender">
            {({ field, form }: { field: { name: string; value: string; onBlur: () => void }; form: { setFieldValue: (f: string, v: string) => void } }) => (
              <Select
                name={field.name}
                value={field.value}
                onChange={(e) => form.setFieldValue('general_information.gender', e.target.value)}
                onBlur={field.onBlur}
                options={GENDER_OPTIONS}
                placeholder="Select gender"
              />
            )}
          </Field>
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_pob">
            Place of birth
          </label>
          <Field id="gi_pob" name="general_information.place_of_birth" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_rel">
            Religion
          </label>
          <Field id="gi_rel" name="general_information.religion" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_mt">
            Mother tongue
          </label>
          <Field id="gi_mt" name="general_information.mother_tongue" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_lrn">
            LRN
          </label>
          <Field id="gi_lrn" name="general_information.lrn" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="gi_sy">
            School year
          </label>
          <Field id="gi_sy" name="general_information.school_year" className={inputClass} readOnly disabled />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass} htmlFor="gi_lastsch">
            Last school attended
          </label>
          <Field id="gi_lastsch" name="general_information.last_school_attended" className={inputClass} />
        </div>
      </div>
      <div className="mt-4">
        <label className={labelClass} htmlFor="gi_addr">
          Complete address *
        </label>
        <Field as="textarea" id="gi_addr" name="general_information.complete_address" rows={3} className={inputClass} />
      </div>
    </div>
  )
}

function StepFamily() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">Family information</h2>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Father</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className={labelClass}>Name</label>
          <Field name="family_information.father.name" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Age</label>
          <Field name="family_information.father.age" type="number" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Occupation</label>
          <Field name="family_information.father.occupation" className={inputClass} />
        </div>
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Mother</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className={labelClass}>Name</label>
          <Field name="family_information.mother.name" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Age</label>
          <Field name="family_information.mother.age" type="number" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Occupation</label>
          <Field name="family_information.mother.occupation" className={inputClass} />
        </div>
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Siblings</h3>
      <p className="mb-3 text-xs text-slate-500">Sibling counts are optional—leave blank if not applicable.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Brothers (count, optional)</label>
          <Field name="family_information.siblings.brothers" type="number" className={inputClass} min={0} />
        </div>
        <div>
          <label className={labelClass}>Sisters (count, optional)</label>
          <Field name="family_information.siblings.sisters" type="number" className={inputClass} min={0} />
        </div>
      </div>
    </div>
  )
}

function StepEmergency() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">Emergency contact</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className={labelClass}>Name *</label>
          <Field name="emergency_contact.name" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Relationship</label>
          <Field name="emergency_contact.relationship" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Age</label>
          <Field name="emergency_contact.age" type="number" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Contact number *</label>
          <Field name="emergency_contact.contact_number" className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Address</label>
          <Field as="textarea" name="emergency_contact.address" rows={2} className={inputClass} />
        </div>
      </div>
    </div>
  )
}

function StepHealth() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">Health information</h2>
      <p className="text-sm text-slate-500 mb-6">Check only if applicable. Details appear when you mark yes.</p>
      <HealthWhenRow title="Had chicken pox?" basePath="health_information.had_chicken_pox" />
      <HealthWhenRow title="Had chicken pox vaccine?" basePath="health_information.had_chicken_pox_vaccine" />
      <HealthDetailsRow title="Hospitalization in the past year?" basePath="health_information.hospitalization_past_year" />
      <HealthDetailsRow title="Chronic condition?" basePath="health_information.chronic_condition" />
      <HealthDetailsRow title="Allergies?" basePath="health_information.allergies" />
      <HealthDetailsRow title="Other medical problems?" basePath="health_information.other_medical_problems" />
    </div>
  )
}

function StepAgreement() {
  const [field, , helpers] = useField({ name: 'agreement.school_policies_accepted', type: 'checkbox' })
  const accepted = !!field.value

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">Agreement</h2>
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-800">AGREEMENT</p>
      <p className="text-sm font-medium text-slate-600">(For Parent/Guardian)</p>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        I have read and understood the school policies. I fully agree and hereby promise to adhere and abide to these
        policies, rules and regulations. I also promise to fully support and continue maintain constant dialogue and
        conference with the school to further help my child. I will also fulfill my obligations to this school.
      </p>

      <SwitchField className="mt-8 flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <span data-slot="label" className="text-sm font-medium text-slate-900">
          I accept the agreement above *
        </span>
        <Switch color="indigo" checked={accepted} onChange={(v) => helpers.setValue(!!v)} />
      </SwitchField>
    </div>
  )
}

function HealthWhenRow({ title, basePath }: { title: string; basePath: string }) {
  const [field, , helpers] = useField({ name: `${basePath}.answer`, type: 'checkbox' })
  const checked = !!field.value

  return (
    <div className="mb-4 last:mb-0">
      <label
        className={clsx(
          'group flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-all duration-200',
          checked
            ? 'border-indigo-300 bg-indigo-50/60 shadow-md shadow-indigo-900/10 ring-2 ring-indigo-400/30'
            : 'border-slate-200/90 bg-white shadow-sm hover:border-slate-300 hover:shadow-md',
        )}
      >
        <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => helpers.setValue(e.target.checked)}
            onBlur={field.onBlur}
            name={field.name}
            className="sr-only"
          />
          <span
            className={clsx(
              'flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all duration-200',
              checked
                ? 'scale-100 border-indigo-600 bg-indigo-600 shadow-inner'
                : 'border-slate-300 bg-white shadow-sm group-focus-within:ring-2 group-focus-within:ring-indigo-500',
            )}
          >
            <Check
              className={clsx('h-3.5 w-3.5 text-white transition-transform duration-200', checked ? 'scale-100' : 'scale-0')}
              strokeWidth={3}
            />
          </span>
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          <span className="mt-2 block text-xs text-slate-500">Mark if yes</span>
        </span>
      </label>
      <div
        className={clsx(
          'overflow-hidden transition-all duration-300 ease-out',
          checked ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="pt-3 pl-1">
          <label className={labelClass}>When / details</label>
          <Field name={`${basePath}.when`} className={inputClass} placeholder="Optional" />
        </div>
      </div>
    </div>
  )
}

function HealthDetailsRow({ title, basePath }: { title: string; basePath: string }) {
  const [field, , helpers] = useField({ name: `${basePath}.answer`, type: 'checkbox' })
  const checked = !!field.value

  return (
    <div className="mb-4 last:mb-0">
      <label
        className={clsx(
          'group flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-all duration-200',
          checked
            ? 'border-indigo-300 bg-indigo-50/60 shadow-md shadow-indigo-900/10 ring-2 ring-indigo-400/30'
            : 'border-slate-200/90 bg-white shadow-sm hover:border-slate-300 hover:shadow-md',
        )}
      >
        <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => helpers.setValue(e.target.checked)}
            onBlur={field.onBlur}
            name={field.name}
            className="sr-only"
          />
          <span
            className={clsx(
              'flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all duration-200',
              checked
                ? 'scale-100 border-indigo-600 bg-indigo-600 shadow-inner'
                : 'border-slate-300 bg-white shadow-sm group-focus-within:ring-2 group-focus-within:ring-indigo-500',
            )}
          >
            <Check
              className={clsx('h-3.5 w-3.5 text-white transition-transform duration-200', checked ? 'scale-100' : 'scale-0')}
              strokeWidth={3}
            />
          </span>
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          <span className="mt-2 block text-xs text-slate-500">Mark if yes</span>
        </span>
      </label>
      <div
        className={clsx(
          'overflow-hidden transition-all duration-300 ease-out',
          checked ? 'max-h-56 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="pt-3 pl-1">
          <label className={labelClass}>Details</label>
          <Field as="textarea" name={`${basePath}.details`} rows={2} className={inputClass} placeholder="Optional" />
        </div>
      </div>
    </div>
  )
}

export default PublicAdmissionForm
