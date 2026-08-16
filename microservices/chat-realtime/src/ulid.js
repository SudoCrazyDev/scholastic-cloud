/**
 * ULID — a 26-character identifier that sorts by the time it was minted.
 *
 * Used for message ids so the primary key is also the reading order. A random
 * UUID would sort arbitrarily, leaving no way to page a transcript without an
 * extra column to order by.
 *
 * Crockford base32: 10 characters of millisecond timestamp, 16 of randomness.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const TIME_LEN = 10
const RANDOM_LEN = 16

function encodeTime(now) {
  let out = ''
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = now % 32
    out = ALPHABET[mod] + out
    now = (now - mod) / 32
  }
  return out
}

function encodeRandom() {
  const bytes = new Uint8Array(RANDOM_LEN)
  crypto.getRandomValues(bytes)

  let out = ''
  for (let i = 0; i < RANDOM_LEN; i++) out += ALPHABET[bytes[i] % 32]
  return out
}

export function ulid(now = Date.now()) {
  return encodeTime(now) + encodeRandom()
}
