/**
 * base64url, both directions.
 *
 * Every key, token and signature that crosses this service's boundary is
 * base64url — JWT parts, VAPID keys, the two keys a browser hands over when it
 * subscribes to push. Workers has `atob`/`btoa` and nothing else, so the
 * conversion is hand-rolled here once rather than in each caller.
 */

export function base64UrlToBytes(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  return bytes
}

export function bytesToBase64Url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)

  let binary = ''
  // Chunked: spreading a large array into String.fromCharCode blows the argument
  // limit, and a push payload is a few kilobytes.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Concatenate byte arrays — the shape most of the push encryption is built from. */
export function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)

  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }

  return out
}
