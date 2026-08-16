import { useCallback, useEffect, useRef, useState } from 'react'
import {
  disablePush,
  enablePush,
  pushState,
  resubscribeIfNeeded,
  type ChatPushState,
} from '../services/chatPush'

/**
 * Browser notifications for chat, as a single toggle.
 *
 * The state is read from the browser on mount rather than remembered, because
 * the browser can change it without the app: permission revoked in site
 * settings, a subscription expired, a different profile on a shared tablet. The
 * answer here is always what the device will actually do.
 */
export const useChatPush = () => {
  const [state, setState] = useState<ChatPushState>('unavailable')
  const [busy, setBusy] = useState(false)

  // The toggle reads the current state, and a stale closure would flip the wrong
  // way after a change made in another tab.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let mounted = true

    pushState().then(current => {
      if (mounted) setState(current)
    })

    // Quietly re-assert what this device already has, in case the two sides
    // drifted apart while it was closed.
    resubscribeIfNeeded()

    return () => {
      mounted = false
    }
  }, [])

  const toggle = useCallback(async () => {
    if (busy || stateRef.current === 'unavailable' || stateRef.current === 'blocked') return

    setBusy(true)
    try {
      setState(await (stateRef.current === 'on' ? disablePush() : enablePush()))
    } catch {
      // Whatever the browser was doing before, it is still doing. Re-read rather
      // than guess which side of the change it stopped on.
      setState(await pushState())
    } finally {
      setBusy(false)
    }
  }, [busy])

  return { state, busy, toggle }
}
