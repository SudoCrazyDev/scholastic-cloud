import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '../../components/input'
import { Button } from '../../components/button'
import { Select } from '../../components/select'
import { Autocomplete } from '../../components/autocomplete'
import { classSectionService } from '../../services/classSectionService'
import { subjectService } from '../../services/subjectService'
import { studentService } from '../../services/studentService'
import { studentSubjectService } from '../../services/studentSubjectService'
import { useAuth } from '../../hooks/useAuth'
import { staffService } from '../../services/staffService'
import type { Student } from '../../types'

interface SectionOption {
  id: string
  label: string
  description?: string
}

const validationSchema = Yup.object().shape({
  subject_type: Yup.string()
    .oneOf(['parent', 'child'])
    .required('Subject type is required'),
  parent_subject_id: Yup.string().when('subject_type', {
    is: 'child',
    then: (s) => s.required('Parent subject is required for child subjects'),
    otherwise: (s) => s.nullable().optional(),
  }),
  title: Yup.string()
    .min(2, 'Title must be at least 2 characters')
    .max(255)
    .required('Title is required'),
  variant: Yup.string().max(255).nullable().optional(),
  start_time: Yup.string()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Must be HH:MM format')
    .nullable()
    .optional(),
  end_time: Yup.string()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Must be HH:MM format')
    .nullable()
    .optional()
    .test('after-start', 'End time must be after start time', function (val) {
      const { start_time } = this.parent
      if (!start_time || !val) return true
      return new Date(`2000-01-01T${val}`) > new Date(`2000-01-01T${start_time}`)
    }),
  adviser: Yup.string().when('subject_type', {
    is: 'child',
    then: (s) => s.required('Subject teacher is required for child subjects'),
    otherwise: (s) => s.optional(),
  }),
  is_limited_student: Yup.boolean().optional(),
})

interface Props {
  isOpen: boolean
  onClose: () => void
  defaultStartTime?: string
  defaultEndTime?: string
}

export function AddScheduleModal({ isOpen, onClose, defaultStartTime, defaultEndTime }: Props) {
  const { user } = useAuth()
  const institutionId = user?.user_institutions?.[0]?.institution_id ?? ''
  const queryClient = useQueryClient()

  // ── Section selector ───────────────────────────────────────────────────────
  const [selectedSection, setSelectedSection] = useState<SectionOption | null>(null)
  const [sectionSearch, setSectionSearch] = useState('')

  const { data: sectionsResponse, isLoading: sectionsLoading } = useQuery({
    queryKey: ['sections-add-schedule', institutionId, sectionSearch],
    queryFn: () =>
      classSectionService.getClassSectionsByInstitution(institutionId, {
        search: sectionSearch || undefined,
        per_page: 5,
      }),
    enabled: !!institutionId && isOpen,
    staleTime: 30 * 1000,
  })
  const sectionOptions: SectionOption[] = (sectionsResponse?.data ?? []).map((s) => ({
    id: s.id,
    label: `${s.grade_level} – ${s.title}`,
    description: s.academic_year ?? undefined,
  }))

  // ── Parent subjects for selected section ───────────────────────────────────
  const { data: parentSubjectsResponse } = useQuery({
    queryKey: ['subjects-parent', selectedSection?.id],
    queryFn: () => subjectService.getSubjects({ class_section_id: selectedSection!.id }),
    enabled: !!selectedSection,
    staleTime: 60 * 1000,
  })
  const parentSubjects = useMemo(
    () => (parentSubjectsResponse?.data ?? []).filter((s) => s.subject_type === 'parent'),
    [parentSubjectsResponse],
  )

  // ── Teacher autocomplete ───────────────────────────────────────────────────
  const [teacherSearch, setTeacherSearch] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState<{ id: string; label: string; description?: string } | null>(null)

  const { data: teachersResponse, isLoading: teachersLoading } = useQuery({
    queryKey: ['teachers-add-schedule', teacherSearch],
    queryFn: () => staffService.getStaffs({ search: teacherSearch || undefined, limit: 10 }),
    enabled: isOpen,
    staleTime: 30 * 1000,
  })
  const teacherOptions = (teachersResponse?.data ?? []).map((t) => ({
    id: t.id,
    label: [t.first_name, t.middle_name, t.last_name, t.ext_name].filter(Boolean).join(' '),
    description: t.email,
  }))

  // ── Students for limited capacity ──────────────────────────────────────────
  const [sectionStudents, setSectionStudents] = useState<Student[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [studentSearch, setStudentSearch] = useState('')

  // ── Mutation ───────────────────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof subjectService.createSubject>[0]) => subjectService.createSubject(data),
    onSuccess: async (result, _vars) => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      // Assign students if needed
      if (formik.values.is_limited_student && selectedStudentIds.size > 0) {
        const subjectId = (result as any)?.data?.id
        if (subjectId) {
          await studentSubjectService.bulkAssign({
            student_ids: Array.from(selectedStudentIds),
            subject_id: subjectId,
          })
        }
      }
      handleClose()
    },
    onError: (err: any) => {
      setSubmitError(err?.response?.data?.message ?? 'Failed to add subject')
    },
  })

  // ── Formik ─────────────────────────────────────────────────────────────────
  const formik = useFormik({
    initialValues: {
      subject_type: 'child' as 'parent' | 'child',
      parent_subject_id: '',
      title: '',
      variant: '',
      start_time: defaultStartTime ?? '',
      end_time: defaultEndTime ?? '',
      adviser: '',
      is_limited_student: false,
    },
    validationSchema,
    onSubmit: (values) => {
      if (!selectedSection) return
      setSubmitError(null)
      mutation.mutate({
        institution_id: institutionId,
        class_section_id: selectedSection.id,
        subject_type: values.subject_type,
        parent_subject_id: values.subject_type === 'child' ? values.parent_subject_id : undefined,
        title: values.title,
        variant: values.variant || undefined,
        start_time: values.start_time || undefined,
        end_time: values.end_time || undefined,
        adviser: values.adviser || undefined,
        is_limited_student: values.is_limited_student,
      })
    },
  })

  // ── Reset on open/close ────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      formik.setFieldValue('start_time', defaultStartTime ?? '')
      formik.setFieldValue('end_time', defaultEndTime ?? '')
    } else {
      formik.resetForm()
      setSelectedSection(null)
      setSectionSearch('')
      setSelectedTeacher(null)
      setTeacherSearch('')
      setSectionStudents([])
      setSelectedStudentIds(new Set())
      setStudentSearch('')
      setSubmitError(null)
    }
  }, [isOpen])

  // ── Clear parent_subject_id when switching type ────────────────────────────
  useEffect(() => {
    if (formik.values.subject_type === 'parent') {
      formik.setFieldValue('parent_subject_id', '')
    }
  }, [formik.values.subject_type])

  // ── Clear students if limited toggled off ──────────────────────────────────
  useEffect(() => {
    if (!formik.values.is_limited_student) {
      setSelectedStudentIds(new Set())
    }
  }, [formik.values.is_limited_student])

  // ── Load students when limited capacity toggled ────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!selectedSection) return
      try {
        const res = await studentService.getStudentsByClassSection(selectedSection.id)
        const students = (res?.data ?? []).map((ss: any) => ss.student) as Student[]
        setSectionStudents(students.filter(Boolean))
      } catch {
        setSectionStudents([])
      }
    }
    if (isOpen && formik.values.is_limited_student && selectedSection) {
      load()
    }
  }, [isOpen, selectedSection?.id, formik.values.is_limited_student])

  const handleTeacherSelect = (t: { id: string; label: string; description?: string } | null) => {
    setSelectedTeacher(t)
    formik.setFieldValue('adviser', t?.id ?? '')
    if (!t) setTeacherSearch('')
  }

  const handleClose = () => {
    if (!mutation.isPending) onClose()
  }

  const availableParentSubjects = formik.values.subject_type === 'child' ? parentSubjects : []

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50"
            onClick={handleClose}
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-lg bg-white rounded-xl shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Schedule</h3>
                <button
                  onClick={handleClose}
                  disabled={mutation.isPending}
                  className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Error banner */}
                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{submitError}</p>
                  </div>
                )}

                {/* ── Step 1: Section selector ── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Class Section <span className="text-red-500">*</span>
                  </label>
                  <Autocomplete
                    value={selectedSection}
                    onChange={(opt) => {
                      setSelectedSection(opt)
                      formik.setFieldValue('parent_subject_id', '')
                      setSelectedTeacher(null)
                      formik.setFieldValue('adviser', '')
                    }}
                    options={sectionOptions}
                    placeholder="Search class section..."
                    loading={sectionsLoading}
                    onQueryChange={setSectionSearch}
                    filter={() => true}
                  />
                  {!selectedSection && (
                    <p className="mt-1.5 text-xs text-gray-400">Select a class section to continue filling out the form.</p>
                  )}
                </div>

                {/* ── Step 2: Subject form (shown only after section is selected) ── */}
                {selectedSection && (
                  <form onSubmit={formik.handleSubmit} className="space-y-5">
                    {/* Subject Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject Type <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-5">
                        {(['parent', 'child'] as const).map((type) => (
                          <label key={type} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="subject_type"
                              value={type}
                              checked={formik.values.subject_type === type}
                              onChange={formik.handleChange}
                              className="accent-indigo-600"
                            />
                            <span className="text-sm text-gray-700">
                              {type === 'parent' ? 'Parent Subject (e.g., MAPEH)' : 'Child Subject (e.g., PE, Arts)'}
                            </span>
                          </label>
                        ))}
                      </div>
                      {formik.touched.subject_type && formik.errors.subject_type && (
                        <p className="mt-1 text-sm text-red-600">{formik.errors.subject_type}</p>
                      )}
                    </div>

                    {/* Parent Subject (child only) */}
                    {formik.values.subject_type === 'child' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Parent Subject <span className="text-red-500">*</span>
                          {availableParentSubjects.length > 0 && (
                            <span className="text-xs text-gray-400 font-normal ml-1">
                              ({availableParentSubjects.length} available)
                            </span>
                          )}
                        </label>
                        {availableParentSubjects.length === 0 ? (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                            No parent subjects in this section yet. Create a parent subject first.
                          </div>
                        ) : (
                          <>
                            <Select
                              name="parent_subject_id"
                              value={formik.values.parent_subject_id}
                              onChange={formik.handleChange}
                              onBlur={formik.handleBlur}
                              placeholder="Choose a parent subject..."
                              className={formik.touched.parent_subject_id && formik.errors.parent_subject_id ? 'border-red-500' : ''}
                              options={availableParentSubjects.map((p) => ({
                                value: p.id,
                                label: `${p.title}${p.variant ? ` – ${p.variant}` : ''}`,
                              }))}
                            />
                            {formik.touched.parent_subject_id && formik.errors.parent_subject_id && (
                              <p className="mt-1 text-sm text-red-600">{formik.errors.parent_subject_id}</p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Subject Title <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="text"
                        name="title"
                        value={formik.values.title}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        placeholder={formik.values.subject_type === 'parent' ? 'e.g., MAPEH, Core Subjects' : 'e.g., PE, Arts, Music'}
                        className={formik.touched.title && formik.errors.title ? 'border-red-500' : ''}
                      />
                      {formik.touched.title && formik.errors.title && (
                        <p className="mt-1 text-sm text-red-600">{formik.errors.title}</p>
                      )}
                    </div>

                    {/* Variant */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Subject Variant <span className="text-xs text-gray-400 font-normal">(optional)</span>
                      </label>
                      <Input
                        type="text"
                        name="variant"
                        value={formik.values.variant}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        placeholder="e.g., Sewing, Machineries, Plumbing"
                        className={formik.touched.variant && formik.errors.variant ? 'border-red-500' : ''}
                      />
                      {formik.touched.variant && formik.errors.variant && (
                        <p className="mt-1 text-sm text-red-600">{formik.errors.variant}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        For subjects with the same name but different specializations (e.g., TLE – Sewing, TLE – Machineries)
                      </p>
                    </div>

                    {/* Start / End time */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Time</label>
                        <Input
                          type="time"
                          name="start_time"
                          value={formik.values.start_time}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          className={formik.touched.start_time && formik.errors.start_time ? 'border-red-500' : ''}
                        />
                        {formik.touched.start_time && formik.errors.start_time && (
                          <p className="mt-1 text-sm text-red-600">{formik.errors.start_time}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">End Time</label>
                        <Input
                          type="time"
                          name="end_time"
                          value={formik.values.end_time}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          className={formik.touched.end_time && formik.errors.end_time ? 'border-red-500' : ''}
                        />
                        {formik.touched.end_time && formik.errors.end_time && (
                          <p className="mt-1 text-sm text-red-600">{formik.errors.end_time}</p>
                        )}
                      </div>
                    </div>

                    {/* Teacher / Adviser */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-medium text-gray-700">
                          Subject Teacher{formik.values.subject_type === 'child' && <span className="text-red-500"> *</span>}
                        </label>
                        {selectedTeacher && (
                          <button
                            type="button"
                            onClick={() => handleTeacherSelect(null)}
                            className="text-xs text-red-500 hover:text-red-600"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <Autocomplete
                        value={selectedTeacher}
                        onChange={handleTeacherSelect}
                        onQueryChange={setTeacherSearch}
                        options={teacherOptions}
                        placeholder="Search for a teacher..."
                        loading={teachersLoading}
                        error={!!(formik.touched.adviser && formik.errors.adviser)}
                        filter={() => true}
                      />
                      {formik.touched.adviser && formik.errors.adviser && (
                        <p className="mt-1 text-sm text-red-600">{formik.errors.adviser}</p>
                      )}
                      {formik.values.subject_type === 'parent' && (
                        <p className="mt-1 text-xs text-gray-400">Optional for parent subjects</p>
                      )}
                    </div>

                    {/* Limited student capacity */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="is_limited_student"
                          checked={formik.values.is_limited_student}
                          onChange={formik.handleChange}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm text-gray-700">Limited student capacity</span>
                      </label>

                      {formik.values.is_limited_student && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Select Students</label>
                            <input
                              type="text"
                              value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              placeholder="Search students in this section..."
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="mt-1 text-xs text-gray-400">Only students in the selected section can be assigned.</p>
                          </div>

                          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                            {sectionStudents
                              .filter((s) => {
                                if (!studentSearch) return true
                                const term = studentSearch.toLowerCase()
                                const name = [s.first_name, s.middle_name, s.last_name, s.ext_name]
                                  .filter(Boolean)
                                  .join(' ')
                                  .toLowerCase()
                                return name.includes(term) || (s.lrn ?? '').toLowerCase().includes(term)
                              })
                              .map((s) => {
                                const checked = selectedStudentIds.has(s.id)
                                return (
                                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const next = new Set(selectedStudentIds)
                                        if (e.target.checked) next.add(s.id)
                                        else next.delete(s.id)
                                        setSelectedStudentIds(next)
                                      }}
                                      className="accent-indigo-600"
                                    />
                                    <span className="flex-1 text-gray-700">
                                      {[s.first_name, s.middle_name, s.last_name, s.ext_name].filter(Boolean).join(' ')}
                                      {s.lrn && <span className="text-gray-400 ml-2">({s.lrn})</span>}
                                    </span>
                                  </label>
                                )
                              })}
                            {sectionStudents.length === 0 && (
                              <p className="px-3 py-4 text-sm text-gray-400 text-center">No students found in this section.</p>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{selectedStudentIds.size} selected</span>
                            <div className="flex gap-3">
                              <button type="button" onClick={() => setSelectedStudentIds(new Set())} className="underline hover:text-gray-700">
                                Clear
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedStudentIds(new Set(sectionStudents.map((s) => s.id)))}
                                className="underline hover:text-gray-700"
                              >
                                Select all
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Button type="button" variant="outline" onClick={handleClose} disabled={mutation.isPending}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={mutation.isPending || formik.isSubmitting}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {mutation.isPending ? 'Saving...' : 'Add Subject'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
