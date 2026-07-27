import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Browser-local autosave for long editor forms.
 *
 * Teachers on unreliable connections lose whole quizzes and lessons when a save
 * request fails, so the editor state is mirrored into localStorage as they type.
 * Nothing here talks to the server — it is purely a safety net for the work in
 * progress, cleared as soon as the real save succeeds.
 */

const PREFIX = 'sc:draft:'

/** Stale drafts are swept on load so storage does not grow without bound. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export interface StoredDraft<T> {
  savedAt: number
  data: T
}

interface UseLocalDraftOptions<T> {
  /**
   * Stable identity for what is being edited, e.g. `assessment:<subjectId>:<methodId|new>`.
   * Pass null to disable (editor closed).
   */
  key: string | null
  /** Current editor state. */
  value: T
  /**
   * The state as last known to the server. While `value` matches this, there is
   * nothing worth keeping and any stored draft is dropped.
   */
  baseline: T | null
  debounceMs?: number
  /** Warn before leaving the page while there are unsaved changes. */
  warnOnUnload?: boolean
}

export interface UseLocalDraftResult<T> {
  /** A draft found in storage that is newer than what the editor loaded. */
  recovered: StoredDraft<T> | null
  /** Stop offering the recovered draft without deleting the user's work. */
  dismissRecovered: () => void
  /** Throw away the stored draft (user chose to start from the server copy). */
  discard: () => void
  /** Mark the current value as saved: drops the stored draft and resets the baseline. */
  markSaved: (savedValue?: T) => void
  /** True when the editor holds changes that are not on the server. */
  isDirty: boolean
  /** When the local copy was last written, for the "saved a moment ago" hint. */
  lastAutosavedAt: number | null
}

const storageKey = (key: string) => `${PREFIX}${key}`

const readDraft = <T,>(key: string): StoredDraft<T> | null => {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(key))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Drop drafts left behind by editors that were closed long ago. */
const sweepExpiredDrafts = () => {
  try {
    for (const name of Object.keys(localStorage)) {
      if (!name.startsWith(PREFIX)) continue
      const raw = localStorage.getItem(name)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as StoredDraft<unknown>
        if (typeof parsed?.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) {
          localStorage.removeItem(name)
        }
      } catch {
        localStorage.removeItem(name)
      }
    }
  } catch {
    // localStorage unavailable (private mode / disabled) — autosave just no-ops.
  }
}

export function useLocalDraft<T>({
  key,
  value,
  baseline,
  debounceMs = 700,
  warnOnUnload = true,
}: UseLocalDraftOptions<T>): UseLocalDraftResult<T> {
  const [recovered, setRecovered] = useState<StoredDraft<T> | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null)

  // The server-side snapshot, serialized once per change so the autosave tick
  // only has to stringify the live value.
  const baselineRef = useRef<string | null>(null)
  useEffect(() => {
    baselineRef.current = baseline === null || baseline === undefined ? null : JSON.stringify(baseline)
  }, [baseline])

  // Look for previous work whenever the editor opens on something new.
  useEffect(() => {
    setIsDirty(false)
    setLastAutosavedAt(null)
    if (!key) {
      setRecovered(null)
      return
    }
    sweepExpiredDrafts()
    const stored = readDraft<T>(key)
    // A stored draft identical to the server copy is not worth offering.
    if (stored && JSON.stringify(stored.data) === baselineRef.current) {
      try {
        localStorage.removeItem(storageKey(key))
      } catch {
        /* ignore */
      }
      setRecovered(null)
      return
    }
    setRecovered(stored)
    // Intentionally keyed only on `key`: re-reading on every keystroke would
    // resurrect the banner after the user dismissed it.
  }, [key])

  // Mirror the live value into storage, debounced.
  useEffect(() => {
    if (!key) return
    const timer = setTimeout(() => {
      let serialized: string
      try {
        serialized = JSON.stringify(value)
      } catch {
        return
      }

      if (serialized === baselineRef.current) {
        try {
          localStorage.removeItem(storageKey(key))
        } catch {
          /* ignore */
        }
        setIsDirty(false)
        return
      }

      try {
        localStorage.setItem(
          storageKey(key),
          JSON.stringify({ savedAt: Date.now(), data: value } satisfies StoredDraft<T>)
        )
        setIsDirty(true)
        setLastAutosavedAt(Date.now())
      } catch {
        // Quota exceeded or storage disabled: the editor keeps working, it just
        // loses the safety net.
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [key, value, debounceMs])

  // Last line of defence against a closed tab.
  useEffect(() => {
    if (!warnOnUnload || !isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [warnOnUnload, isDirty])

  const dismissRecovered = useCallback(() => setRecovered(null), [])

  const discard = useCallback(() => {
    if (key) {
      try {
        localStorage.removeItem(storageKey(key))
      } catch {
        /* ignore */
      }
    }
    setRecovered(null)
    setIsDirty(false)
    setLastAutosavedAt(null)
  }, [key])

  const markSaved = useCallback(
    (savedValue?: T) => {
      if (savedValue !== undefined) {
        try {
          baselineRef.current = JSON.stringify(savedValue)
        } catch {
          /* ignore */
        }
      }
      discard()
    },
    [discard]
  )

  return { recovered, dismissRecovered, discard, markSaved, isDirty, lastAutosavedAt }
}

export default useLocalDraft
