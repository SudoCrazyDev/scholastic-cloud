/*
 * Service worker — chat notifications only.
 *
 * Deliberately not a caching layer and not an offline shell. It exists for one
 * reason: a `push` event is delivered to a service worker whether or not the app
 * is open, and that is the only way to reach a student whose tab is shut. There
 * is no `fetch` handler here on purpose — adding one would put this file in the
 * path of every request the app makes, which is a large risk to take for a
 * feature that needs none of it.
 */

// Take over as soon as a new version is installed, rather than waiting for every
// tab to close. A stale worker here would keep showing the old notification
// shape long after the app had moved on.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Not ours, or malformed. Showing a blank notification is worse than none.
    return
  }

  if (!payload.title) return

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || '',
      // One notification per group, replaced as messages arrive — a class group
      // during a lesson should be one line in the shade, not forty.
      tag: payload.tag || 'chat',
      renotify: true,
      icon: '/deped-logo.png',
      badge: '/deped-logo.png',
      data: { url: payload.url || '/chat' },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  const target = new URL(event.notification.data?.url || '/chat', self.location.origin).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Reuse a tab that is already open — a school tablet ends the day with
      // thirty windows otherwise. Navigating it also lands on the right group.
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }

      await self.clients.openWindow(target)
    })(),
  )
})
