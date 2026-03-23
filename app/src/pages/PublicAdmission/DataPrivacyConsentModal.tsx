import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogTitle } from '../../components/dialog'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { AdmissionFormPayload } from '../../types'
import { useFormikContext } from 'formik'
import { sanitizeAdmissionPayload } from './admissionPayloadUtils'

type MutPayload = AdmissionFormPayload & { institution_id: string }

type MutationLike = {
  mutate: (variables: MutPayload, options?: { onSuccess?: () => void; onError?: () => void }) => void
  isPending: boolean
}

export function DataPrivacyConsentModal({
  open,
  onClose,
  institutionId,
  institutionTitle,
  mutation,
}: {
  open: boolean
  onClose: () => void
  institutionId: string
  institutionTitle: string
  mutation: MutationLike
}) {
  const formik = useFormikContext<AdmissionFormPayload>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [readPolicy, setReadPolicy] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const threshold = 48
    if (scrollTop + clientHeight >= scrollHeight - threshold) {
      setScrolledToBottom(true)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setScrolledToBottom(false)
    setReadPolicy(false)
    setConsentGiven(false)
    const measure = () => {
      const el = scrollRef.current
      if (el && el.scrollHeight <= el.clientHeight + 12) {
        setScrolledToBottom(true)
      }
    }
    requestAnimationFrame(measure)
    const t = window.setTimeout(measure, 150)
    return () => window.clearTimeout(t)
  }, [open])

  const canSubmit = scrolledToBottom && readPolicy && consentGiven

  const handleFinalSubmit = () => {
    if (!canSubmit) return
    const payload: MutPayload = {
      institution_id: institutionId,
      ...formik.values,
      agreement: {
        ...formik.values.agreement,
        privacy_read_policy: true,
        privacy_consent_given: true,
      },
    }
    mutation.mutate(sanitizeAdmissionPayload(payload))
  }

  return (
    <Dialog
      light
      open={open}
      onClose={onClose}
      size="5xl"
      className="max-h-[90vh] flex flex-col bg-white text-slate-900 shadow-xl ring-slate-200 dark:bg-white dark:ring-slate-200"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-white text-slate-900">
        <DialogTitle light className="shrink-0 pr-8 text-xl font-semibold text-slate-900">
          DATA PRIVACY CONSENT FORM
        </DialogTitle>
        <p className="mt-2 shrink-0 text-sm text-slate-600">
          Please read the full policy below. Scroll to the bottom to confirm.
        </p>

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="mt-4 min-h-0 max-h-[min(55vh,520px)] flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-800 shadow-inner"
        >
          <DataPrivacyBody institutionTitle={institutionTitle} />
        </div>

        <div className="mt-6 shrink-0 space-y-4 border-t border-slate-200 bg-white pt-4">
          <PrivacyConsentCheckboxRow
            checked={readPolicy}
            onChange={setReadPolicy}
            disabled={!scrolledToBottom}
            title="I have read and understood the School's Data Privacy Policy."
          />
          <PrivacyConsentCheckboxRow
            checked={consentGiven}
            onChange={setConsentGiven}
            disabled={!scrolledToBottom}
            title={
              <>
                I give my free and unequivocal consent to <span className="font-medium text-slate-900">{institutionTitle}</span> to
                collect, process, use and withhold the personal data and information I have furnished the school upon
                enrollment, during the course of my child&apos;s education in the school and upon graduation.
              </>
            }
          />

          {!scrolledToBottom && (
            <p className="text-xs text-amber-800">Scroll through the policy above to enable the confirmations.</p>
          )}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit || mutation.isPending}
              onClick={handleFinalSubmit}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mutation.isPending ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function PrivacyConsentCheckboxRow({
  checked,
  onChange,
  disabled,
  title,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  title: ReactNode
}) {
  return (
    <label
      className={clsx(
        'group flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-all duration-200',
        disabled && 'pointer-events-none cursor-not-allowed opacity-60',
        checked && !disabled
          ? 'border-indigo-300 bg-indigo-50/60 shadow-md shadow-indigo-900/10 ring-2 ring-indigo-400/30'
          : 'border-slate-200/90 bg-white shadow-sm hover:border-slate-300 hover:shadow-md',
      )}
    >
      <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          className={clsx(
            'flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all duration-200',
            checked && !disabled
              ? 'scale-100 border-indigo-600 bg-indigo-600 shadow-inner'
              : 'border-slate-300 bg-white shadow-sm group-focus-within:ring-2 group-focus-within:ring-indigo-500',
            disabled && 'opacity-50',
          )}
        >
          <Check
            className={clsx(
              'h-3.5 w-3.5 text-white transition-transform duration-200',
              checked && !disabled ? 'scale-100' : 'scale-0',
            )}
            strokeWidth={3}
          />
        </span>
      </span>
      <span
        className={clsx(
          'flex-1 text-sm leading-relaxed text-slate-800',
          disabled && 'text-slate-500',
        )}
      >
        {title}
      </span>
    </label>
  )
}

function DataPrivacyBody({ institutionTitle }: { institutionTitle: string }) {
  return (
    <div className="space-y-6 text-slate-800">
      <p>
        <span className="font-semibold text-slate-900">{institutionTitle}</span>, in compliance with the Data Privacy Act
        of 2012, gives utmost importance to the confidentiality and security of personal data entrusted to us by our
        parents, students, alumni, teaching and non-teaching staff. Our aim to carry out our responsibility as a
        Christian educational institution is coupled with the commitment to keep the personal data and information you
        share with us in strict confidentiality.
      </p>

      <section>
        <h3 className="mb-2 font-semibold text-slate-900">COLLECTION OF PERSONAL INFORMATION</h3>
        <p>
          Personal information refers to any information whether recorded in a material form or not, from which the
          identity of an individual is apparent or can be reasonably and directly ascertained by the entity holding the
          information, or when put together with other information would directly and certainly identify an
          individual, collected upon enrollment, during the course of the child&apos;s education and upon his/her exit
          from the school, such as, but not limited to complete name, home address, e-mail address, telephone numbers,
          gender, citizenship, last school attended, religious belief, academic records from previous schools,
          identification photograph and signature. The school also keeps record of students&apos; academic and
          behavioral performance, attendance, psychological and medical condition, guidance and counseling
          intervention, co-curricular activities, disciplinary status, medical examinations, affiliations inside and
          outside the school, photos and videos from school activities and copies of closed circuit television cameras.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-slate-900">ACCESS AND USE OF INFORMATION</h3>
        <p>
          The personal information of a learner forms part of school records and is accessed and used by{' '}
          <span className="font-medium">{institutionTitle}</span>, specifically by the Office of the School
          Administrator, Office of the Registrar, Offices of the Principal, Offices of the Prefect of Discipline,
          Guidance and Counseling Office, School Clinic and Information Technology Department in the legitimate
          performance of duties and responsibilities, such as, but not limited to, admissions, academic evaluation and
          promotion, discipline implementation, grants and scholarship consideration, behavioral interventions and
          graduation.
        </p>
        <p className="mt-3 font-medium text-slate-900">Personal information of the learners will be used and processed for the following purposes:</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            Photos and videos of students will be used for advertisement through tarpaulins and different social media
            accounts of {institutionTitle}.
          </li>
          <li>
            Complete names, photos and videos will be used for congratulatory posts of learners who won competitions
            outside the School.
          </li>
          <li>
            Complete names and grade/section will be posted online for the purposes of class schedule, sectioning,
            graduation list, honor&apos;s list and for updating online bulletin boards and publications.
          </li>
          <li>
            Personal information of learners may also be disclosed in cases of accreditation or certification purposes
            to be done by any government body or instrumentality.
          </li>
          <li>
            Access to personal information may also be granted to persons required by law or in cases of emergency to
            promote the health, welfare, safety and security of the learning community as a whole.
          </li>
          <li>
            Email addresses, bank account information and contact numbers that will be acquired by the school by reason
            of online payment will be stored for filing reference. The same will also be held by the School in strict
            confidentiality.
          </li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-slate-900">PROTECTION AND PRIVACY</h3>
        <p>
          The student&apos;s data privacy is inviolable. The school shall take all necessary precautions to make the
          personal information safe and confidential by ensuring that physical and technical security measures are
          implemented, that it is protected from any fraudulent and unlawful access and that only authorized school
          official can access the same. Repository of all school records containing personal information is locked and
          secured in a limited-access area. The school also employs technology such as the Learners&apos; Information
          System that is ensured hack-free and access is limited to authorized I.T. staff only.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-slate-900">RIGHTS OF THE DATA SUBJECT</h3>
        <p className="mb-2">The law affords the data subject (learner) the following rights:</p>
        <ul className="list-[lower-alpha] space-y-2 pl-5">
          <li>
            Be informed whether personal information pertaining to him or her shall be, are being or have been processed;
          </li>
          <li>Be furnished the information before the entry of his or her personal information into the processing system</li>
          <li>Reasonable access upon demand to the content, sources, identity of the controller of the data</li>
          <li>
            Dispute the inaccuracy or error in the personal information and have the controller correct it immediately and
            accordingly, unless the request is vexatious or otherwise unreasonable.
          </li>
          <li>
            Suspend, withdraw or order the blocking, removal or destruction of his or her personal information from the
            controller&apos;s filing system upon discovery and substantial proof that the personal information are
            incomplete, outdated, false, unlawfully obtained, used for unauthorized purposes or are no longer necessary
            for the purposes for which they were collected.
          </li>
          <li>
            Be indemnified for any damages sustained due to such inaccurate, incomplete, outdated, false, unlawfully
            obtained or unauthorized use of personal information.
          </li>
          <li>
            The lawful heirs and assigns of the data subject may invoke the rights of the data subject for, which he or
            she is an heir or assignee at any time after the death of the data subject or when the data subject is
            incapacitated or incapable of exercising his/her rights as data subject.
          </li>
          <li>
            Obtain from the controller a copy of data undergoing processing in an electronic or structured format, which
            is commonly used and allows for further use by the data subject.
          </li>
        </ul>
      </section>
    </div>
  )
}
