import { chatService } from './chatService'

/**
 * Turning browser notifications on and off.
 *
 * The browser owns most of this: the permission, the subscription, and the
 * endpoint the push service will accept deliveries at. All this file does is
 * register the worker, get a subscription created against the service's VAPID
 * key, and tell the service where to find it.
 *
 * Every path here fails soft. A school tablet on an old browser, a locked-down
 * profile, a site served over plain http — all of them end at "not available",
 * and chat carries on being chat.
 */

/** Chrome and Firefox require the key as bytes, not as the base64url string. */
const keyToBytes = (key: string): Uint8Array => {
  const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  return bytes
}

export type ChatPushState =
  /** No service worker, no Push API, or no chat service on this deployment. */
  | 'unavailable'
  /** Available and off. */
  | 'off'
  /** Available and on, for this device. */
  | 'on'
  /** The browser was told no, and only the user can undo that from site settings. */
  | 'blocked'

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

/**
 * The registration, created at most once per page.
 *
 * `register` resolves before the worker is active, so callers wait on `ready` —
 * subscribing against a worker that has not activated yet throws.
 */
let registration: Promise<ServiceWorkerRegistration> | null = null

const workerRegistration = () => {
  if (!registration) {
    registration = navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .catch(error => {
        registration = null
        throw error
      })
  }

  return registration
}

const currentSubscription = async () => (await workerRegistration()).pushManager.getSubscription()

/**
 * What the toggle should show right now.
 *
 * Read from the browser rather than from anything remembered locally: the
 * permission can be revoked in site settings, and a subscription can be dropped
 * by the browser itself. Whatever it says is the truth.
 */
export async function pushState(): Promise<ChatPushState> {
  if (!supported()) return 'unavailable'
  if (!(await chatService.hasService())) return 'unavailable'

  if (Notification.permission === 'denied') return 'blocked'

  try {
    const { data } = await chatService.getPushKey()
    if (!data?.key) return 'unavailable'

    return (await currentSubscription()) ? 'on' : 'off'
  } catch {
    return 'unavailable'
  }
}

/**
 * Re-register the subscription this device already holds.
 *
 * Cheap insurance against the two ways the two sides drift apart: a database
 * restored from a backup taken before this device subscribed, or a browser that
 * quietly refreshed the subscription without telling the app. The write is an
 * upsert on the endpoint, so doing it on every load costs one row rewrite.
 */
export async function resubscribeIfNeeded(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return
  if (!(await chatService.hasService())) return

  try {
    const subscription = await currentSubscription()
    if (subscription) await chatService.subscribePush(subscription.toJSON())
  } catch {
    // Notifications will keep working from whatever the service already has.
  }
}

/**
 * Ask for permission and subscribe this device.
 *
 * Only ever called from a click. Browsers penalise a site that prompts on load —
 * Chrome hides the prompt entirely for sites that are refused often — so the
 * permission is asked for at the moment someone has said they want it.
 */
export async function enablePush(): Promise<ChatPushState> {
  if (!supported()) return 'unavailable'

  const { data } = await chatService.getPushKey()
  if (!data?.key) return 'unavailable'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'

  const manager = (await workerRegistration()).pushManager

  const subscription =
    (await manager.getSubscription()) ??
    (await manager.subscribe({
      // Non-negotiable in Chrome: a subscription that could deliver a silent
      // push is not allowed, so every delivery must show a notification.
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(data.key),
    }))

  await chatService.subscribePush(subscription.toJSON())

  return 'on'
}

/**
 * Stop notifications on this device.
 *
 * The subscription is dropped at the browser as well as at the service. Telling
 * only the service would leave a live endpoint that starts working again the
 * moment anything re-registers it.
 */
export async function disablePush(): Promise<ChatPushState> {
  if (!supported()) return 'unavailable'

  const subscription = await currentSubscription()
  if (!subscription) return 'off'

  // Service first: if the browser drops it and the tell-the-service call then
  // fails, the row is orphaned and every message tries a dead endpoint until the
  // push service reports it gone.
  await chatService.unsubscribePush(subscription.endpoint)
  await subscription.unsubscribe()

  return 'off'
}
