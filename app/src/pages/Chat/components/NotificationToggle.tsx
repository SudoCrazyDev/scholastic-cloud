import React from 'react'
import clsx from 'clsx'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { useChatPush } from '../../../hooks/useChatPush'

/**
 * Turn notifications on for this device.
 *
 * Per device, not per account, and the wording says so — someone who turns them
 * on at home and then wonders why the school tablet is silent has been misled by
 * a label, not by a bug.
 *
 * Renders nothing at all where notifications cannot work: an older browser, a
 * deployment with no chat service, or a service with no push key configured. A
 * control that is permanently greyed out only invites the question of why.
 */
export const NotificationToggle: React.FC = () => {
  const { state, busy, toggle } = useChatPush()

  if (state === 'unavailable') return null

  if (state === 'blocked') {
    return (
      <span
        className="flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500"
        title="Your browser is blocking notifications for this site. Allow them in the site settings to turn them back on."
      >
        <BellOff className="h-3 w-3" />
        Notifications blocked
      </span>
    )
  }

  const on = state === 'on'
  const Icon = on ? BellRing : Bell

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      title={
        on
          ? 'Stop showing notifications on this device'
          : 'Show a notification on this device when a message arrives while the app is closed'
      }
      className={clsx(
        'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        busy && 'opacity-60',
        on
          ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="hidden sm:inline">{on ? 'Notifications on' : 'Notify me'}</span>
    </button>
  )
}

export default NotificationToggle
