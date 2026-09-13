import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'
import { matatagService } from '../services/matatagService'
import type {
  MatatagDescriptor,
  MatatagGrid,
  MatatagNarrativeWrite,
  MatatagRatingWrite,
} from '../types'

/** The API's own message where there is one, otherwise the caller's fallback. */
function messageFrom(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message !== '') return message
  }

  return fallback
}

const keys = {
  reference: ['matatag', 'reference'] as const,
  sections: (institutionId?: string, year?: string) =>
    ['matatag', 'sections', institutionId ?? '', year ?? ''] as const,
  grid: (sectionId: string, areaId: string | undefined, term: number, year?: string) =>
    ['matatag', 'grid', sectionId, areaId ?? 'default', term, year ?? ''] as const,
  narratives: (sectionId: string, year?: string) =>
    ['matatag', 'narratives', sectionId, year ?? ''] as const,
  attendance: (sectionId: string, year?: string) =>
    ['matatag', 'attendance', sectionId, year ?? ''] as const,
}

/** Terms, descriptors and macro skills. Config; it changes about once a year. */
export function useMatatagReference() {
  return useQuery({
    queryKey: keys.reference,
    queryFn: () => matatagService.getReference(),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useMatatagSections(params: { institutionId?: string; academicYear?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: keys.sections(params.institutionId, params.academicYear),
    queryFn: () =>
      matatagService.getSections({
        institution_id: params.institutionId,
        academic_year: params.academicYear,
      }),
    enabled: params.enabled !== false,
  })
}

export function useMatatagSectionMutations(institutionId?: string, academicYear?: string) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['matatag', 'sections'] })
    queryClient.invalidateQueries({ queryKey: ['matatag', 'grid'] })
  }

  const optIn = useMutation({
    mutationFn: (vars: { sectionId: string; curriculumVersionId?: string }) =>
      matatagService.optIn(vars.sectionId, {
        academic_year: academicYear,
        curriculum_version_id: vars.curriculumVersionId,
      }),
    onSuccess: response => {
      toast.success(response.message ?? 'This section now reports on MATATAG.')
      invalidate()
    },
    onError: error => {
      toast.error(messageFrom(error, 'Could not switch this section onto MATATAG.'))
    },
  })

  const optOut = useMutation({
    mutationFn: (sectionId: string) =>
      matatagService.optOut(sectionId, { academic_year: academicYear }),
    onSuccess: response => {
      toast.success(response.message ?? 'This section no longer reports on MATATAG.')
      invalidate()
    },
    onError: error => {
      toast.error(messageFrom(error, 'Could not switch this section off MATATAG.'))
    },
  })

  void institutionId

  return { optIn, optOut }
}

/**
 * The grid, held still.
 *
 * `staleTime: Infinity` with every refetch trigger off is not an optimisation
 * — it is the correctness requirement. A teacher types down a column with the
 * keyboard, and any refetch mid-column replaces the row array, remounts the
 * cells and throws away both scroll position and focus. The cache is patched
 * in place on each keystroke instead, and the save never invalidates.
 */
export function useMatatagGrid(params: {
  sectionId: string
  learningAreaId?: string
  term: number
  academicYear?: string
  enabled?: boolean
}) {
  return useQuery({
    queryKey: keys.grid(params.sectionId, params.learningAreaId, params.term, params.academicYear),
    queryFn: () =>
      matatagService.getGrid({
        class_section_id: params.sectionId,
        learning_area_id: params.learningAreaId,
        term: params.term,
        academic_year: params.academicYear,
      }),
    enabled: params.enabled !== false && Boolean(params.sectionId),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
  })
}

export type MatatagSaveState =
  | { status: 'idle' }
  | { status: 'pending'; count: number }
  | { status: 'saving'; count: number }
  | { status: 'saved'; at: number }
  | { status: 'failed'; count: number; message: string }

/**
 * Batched, debounced writes that never take a teacher's keystroke back.
 *
 * Three things here are deliberate and each fixes something the Core Values
 * screen gets wrong:
 *
 * - **The cache patch is O(1) per keystroke.** Ratings arrive keyed
 *   `studentId:slotId`, so a press rewrites one property rather than mapping a
 *   4,550-element array.
 * - **A failed save is not rolled back.** The teacher typed it; it is the
 *   truth. The cells stay as typed, are marked failed, and Retry re-sends.
 *   Reverting a column a teacher just filled, because the wifi dropped, is a
 *   worse outcome than a stale cell with a warning on it.
 * - **Success never invalidates.** There is nothing to learn from the server
 *   that the client does not already know, and refetching is what makes a grid
 *   jump under someone's hands.
 */
export function useMatatagGridSave(params: {
  sectionId: string
  learningAreaId?: string
  term: number
  academicYear?: string
  debounceMs?: number
}) {
  const queryClient = useQueryClient()
  const queryKey = keys.grid(params.sectionId, params.learningAreaId, params.term, params.academicYear)

  const [state, setState] = useState<MatatagSaveState>({ status: 'idle' })

  /** Cells changed since the last flush, keyed so a re-edit replaces. */
  const pending = useRef<Map<string, MatatagRatingWrite>>(new Map())
  /** Cells the last save could not write. Kept visible, kept retryable. */
  const failed = useRef<Map<string, MatatagRatingWrite>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set())

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }

    // One request at a time. A second flush landing mid-save would let the
    // server apply them out of order, and the last write would not be the
    // last keystroke.
    if (inFlight.current || pending.current.size === 0) return

    const batch = Array.from(pending.current.values())
    pending.current.clear()
    inFlight.current = true
    setState({ status: 'saving', count: batch.length })

    try {
      await matatagService.saveRatings({
        class_section_id: params.sectionId,
        term: params.term,
        academic_year: params.academicYear,
        ratings: batch,
      })

      batch.forEach(r => failed.current.delete(`${r.student_id}:${r.slot_id}`))
      setFailedKeys(new Set(failed.current.keys()))
      setState({ status: 'saved', at: Date.now() })
    } catch (error) {
      batch.forEach(r => failed.current.set(`${r.student_id}:${r.slot_id}`, r))
      setFailedKeys(new Set(failed.current.keys()))
      setState({
        status: 'failed',
        count: failed.current.size,
        message: messageFrom(
          error,
          'Could not save. Your marks are still on screen — press Retry.'
        ),
      })
    } finally {
      inFlight.current = false

      // Anything typed while that request was in the air.
      if (pending.current.size > 0) {
        timer.current = setTimeout(() => void flush(), 0)
      }
    }
  }, [params.sectionId, params.term, params.academicYear])

  /** Record one cell: patch the cache now, schedule the write. */
  const setDescriptor = useCallback(
    (studentId: string, slotId: string, descriptor: MatatagDescriptor | null) => {
      const key = `${studentId}:${slotId}`

      queryClient.setQueryData<MatatagGrid>(queryKey, current => {
        if (!current) return current

        const ratings = { ...current.ratings }
        if (descriptor === null) {
          delete ratings[key]
        } else {
          ratings[key] = descriptor
        }

        return {
          ...current,
          ratings,
          counts: { ...current.counts, recorded: Object.keys(ratings).length },
        }
      })

      pending.current.set(key, { student_id: studentId, slot_id: slotId, descriptor })
      setState({ status: 'pending', count: pending.current.size })

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), params.debounceMs ?? 900)
    },
    [queryClient, queryKey, flush, params.debounceMs]
  )

  const retry = useCallback(() => {
    failed.current.forEach((value, key) => pending.current.set(key, value))
    failed.current.clear()
    setFailedKeys(new Set())
    void flush()
  }, [flush])

  /**
   * Nothing typed may be lost to a closed tab, a hidden one, or a route
   * change. The debounce is a convenience; these are the guarantees.
   */
  useEffect(() => {
    const flushNow = () => void flush()

    const onHide = () => {
      if (document.visibilityState === 'hidden') flushNow()
    }

    window.addEventListener('beforeunload', flushNow)
    document.addEventListener('visibilitychange', onHide)

    return () => {
      window.removeEventListener('beforeunload', flushNow)
      document.removeEventListener('visibilitychange', onHide)
      flushNow()
    }
  }, [flush])

  const hasUnsaved = state.status === 'pending' || state.status === 'saving'

  return { state, setDescriptor, flush, retry, failedKeys, hasUnsaved }
}

export function useMatatagNarratives(params: {
  sectionId: string
  academicYear?: string
  enabled?: boolean
}) {
  return useQuery({
    queryKey: keys.narratives(params.sectionId, params.academicYear),
    queryFn: () =>
      matatagService.getNarratives({
        class_section_id: params.sectionId,
        academic_year: params.academicYear,
      }),
    enabled: params.enabled !== false && Boolean(params.sectionId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useMatatagNarrativeMutations(params: { sectionId: string; academicYear?: string }) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (narratives: MatatagNarrativeWrite[]) =>
      matatagService.saveNarratives({
        class_section_id: params.sectionId,
        academic_year: params.academicYear,
        narratives,
      }),
    onSuccess: () => {
      toast.success('Saved.')
      queryClient.invalidateQueries({ queryKey: keys.narratives(params.sectionId, params.academicYear) })
    },
    onError: error => {
      toast.error(messageFrom(error, 'Could not save these narratives.'))
    },
  })
}

export function useMatatagAttendance(params: {
  sectionId: string
  academicYear?: string
  enabled?: boolean
}) {
  return useQuery({
    queryKey: keys.attendance(params.sectionId, params.academicYear),
    queryFn: () =>
      matatagService.getSectionAttendance({
        class_section_id: params.sectionId,
        academic_year: params.academicYear,
      }),
    enabled: params.enabled !== false && Boolean(params.sectionId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Whether a section's grade level is one this module reports on.
 *
 * `class_sections.grade_level` is a free string a school types, so this is
 * lenient in the same way the API is: case-insensitive, whitespace collapsed.
 * The grade levels themselves come from the server, never from a constant
 * here — Key Stage 2 is a different instrument and adding it is not a client
 * decision.
 */
export function useIsKeyStageOne(gradeLevel: string | null | undefined) {
  const { data: reference } = useMatatagReference()

  return useMemo(() => {
    if (!gradeLevel || !reference?.grade_levels) return false

    const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
    const needle = normalise(gradeLevel)

    return reference.grade_levels.some(candidate => normalise(candidate) === needle)
  }, [gradeLevel, reference?.grade_levels])
}
