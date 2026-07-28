import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  userProfileService,
  EMPTY_PERSONAL_INFO,
  EMPTY_FAMILY_BACKGROUND,
  type UserProfileData,
  type PersonalInfo,
  type FamilyBackground,
  type ChildEntry,
  type EducationEntry,
  type EligibilityEntry,
  type WorkEntry,
  type LearningEntry,
} from '../services/userProfileService'

export type ProfileSection =
  | 'personal'
  | 'family'
  | 'children'
  | 'education'
  | 'civil'
  | 'work'
  | 'learning'

const errorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data
  const firstFieldError = data?.errors ? (Object.values(data.errors)[0] as string[])?.[0] : null
  return firstFieldError || data?.message || fallback
}

export function useUserProfile() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => userProfileService.loadAll(),
    // A background refetch would overwrite whatever the user is typing.
    refetchOnWindowFocus: false,
  })

  // Local form state, seeded from the server and re-seeded whenever it reloads.
  const [personal, setPersonal] = useState<PersonalInfo>(EMPTY_PERSONAL_INFO)
  const [family, setFamily] = useState<FamilyBackground>(EMPTY_FAMILY_BACKGROUND)
  const [children, setChildren] = useState<ChildEntry[]>([])
  const [education, setEducation] = useState<EducationEntry[]>([])
  const [eligibility, setEligibility] = useState<EligibilityEntry[]>([])
  const [work, setWork] = useState<WorkEntry[]>([])
  const [learning, setLearning] = useState<LearningEntry[]>([])

  // The last server snapshot: the baseline for dirty checks, row diffing and Cancel.
  const baseline = useRef<UserProfileData | null>(null)

  const seed = (data: UserProfileData) => {
    baseline.current = data
    setPersonal(data.personal)
    setFamily(data.family)
    setChildren(data.children)
    setEducation(data.education)
    setEligibility(data.eligibility)
    setWork(data.work)
    setLearning(data.learning)
  }

  useEffect(() => {
    if (query.data) seed(query.data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data])

  const savedSection = (section: ProfileSection) => {
    // Re-read from the server so new rows pick up their generated ids.
    queryClient.invalidateQueries({ queryKey: ['user-profile'] })
    toast.success(`${LABELS[section]} saved`)
  }

  const failedSection = (section: ProfileSection) => (error: any) =>
    toast.error(errorMessage(error, `Failed to save ${LABELS[section].toLowerCase()}`))

  const personalMutation = useMutation({
    mutationFn: () => userProfileService.savePersonalInfo(personal),
    onSuccess: () => savedSection('personal'),
    onError: failedSection('personal'),
  })

  const familyMutation = useMutation({
    mutationFn: () => userProfileService.saveFamilyBackground(family),
    onSuccess: () => savedSection('family'),
    onError: failedSection('family'),
  })

  const childrenMutation = useMutation({
    mutationFn: () => {
      const rows = children.filter((row) => row.children_name.trim())
      return userProfileService.saveChildren(baseline.current?.children ?? [], rows)
    },
    onSuccess: () => savedSection('children'),
    onError: failedSection('children'),
  })

  const educationMutation = useMutation({
    mutationFn: () => userProfileService.saveEducation(education),
    onSuccess: () => savedSection('education'),
    onError: failedSection('education'),
  })

  const eligibilityMutation = useMutation({
    mutationFn: () =>
      userProfileService.saveEligibility(baseline.current?.eligibilityRecordId ?? null, eligibility),
    onSuccess: () => savedSection('civil'),
    onError: failedSection('civil'),
  })

  const workMutation = useMutation({
    mutationFn: () => userProfileService.saveWorkExperience(baseline.current?.work ?? [], work),
    onSuccess: () => savedSection('work'),
    onError: failedSection('work'),
  })

  const learningMutation = useMutation({
    mutationFn: () => userProfileService.saveLearningDevelopment(learning),
    onSuccess: () => savedSection('learning'),
    onError: failedSection('learning'),
  })

  const mutations: Record<ProfileSection, { mutate: () => void; isPending: boolean }> = {
    personal: personalMutation,
    family: familyMutation,
    children: childrenMutation,
    education: educationMutation,
    civil: eligibilityMutation,
    work: workMutation,
    learning: learningMutation,
  }

  const current: Record<ProfileSection, unknown> = {
    personal,
    family,
    children,
    education,
    civil: eligibility,
    work,
    learning,
  }

  const original = (section: ProfileSection): unknown => {
    const data = baseline.current
    if (!data) return undefined
    switch (section) {
      case 'personal':
        return data.personal
      case 'family':
        return data.family
      case 'children':
        return data.children
      case 'education':
        return data.education
      case 'civil':
        return data.eligibility
      case 'work':
        return data.work
      case 'learning':
        return data.learning
    }
  }

  const isDirty = (section: ProfileSection) =>
    JSON.stringify(current[section]) !== JSON.stringify(original(section))

  /** Which sections the user has actually filled in — drives the completion ring. */
  const hasContent = (section: ProfileSection): boolean => {
    const value = current[section]
    if (Array.isArray(value)) return value.length > 0
    return Object.values(value as Record<string, string>).some((field) => field.trim() !== '')
  }

  const resetSection = (section: ProfileSection) => {
    const data = baseline.current
    if (!data) return
    switch (section) {
      case 'personal':
        return setPersonal(data.personal)
      case 'family':
        return setFamily(data.family)
      case 'children':
        return setChildren(data.children)
      case 'education':
        return setEducation(data.education)
      case 'civil':
        return setEligibility(data.eligibility)
      case 'work':
        return setWork(data.work)
      case 'learning':
        return setLearning(data.learning)
    }
  }

  const saveSection = (section: ProfileSection) => mutations[section].mutate()
  const isSaving = (section: ProfileSection) => mutations[section].isPending

  return {
    isLoading: query.isLoading,
    loadError: query.error,
    refetch: query.refetch,

    personal,
    setPersonal,
    family,
    setFamily,
    children,
    setChildren,
    education,
    setEducation,
    eligibility,
    setEligibility,
    work,
    setWork,
    learning,
    setLearning,

    isDirty,
    hasContent,
    isSaving,
    saveSection,
    resetSection,
  }
}

const LABELS: Record<ProfileSection, string> = {
  personal: 'Personal information',
  family: 'Family background',
  children: 'Children',
  education: 'Educational background',
  civil: 'Civil service eligibility',
  work: 'Work experience',
  learning: 'Learning & development',
}
