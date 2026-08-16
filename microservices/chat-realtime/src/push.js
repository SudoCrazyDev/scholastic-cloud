/**
 * Web Push — the only way a message reaches someone whose tab is closed.
 *
 * Everything else in this service assumes a live client: a socket, or a poll a
 * few seconds apart. Both need the app to be open, which is exactly when a
 * student does not need telling. This is the other case, and it is the one a
 * parent notices — a teacher posts at eight in the evening and nobody sees it
 * until morning.
 *
 * It is written out longhand rather than pulled from a library because the
 * npm ones assume Node's crypto: they reach for `crypto.createECDH` and Buffer,
 * neither of which exists in a Worker. Everything below is WebCrypto, which
 * Workers has natively.
 *
 * Two specs meet here:
 *
 *   RFC 8292 (VAPID)  — proves to Google's or Mozilla's push service that this
 *                       sender is who it claims, so it will accept the request.
 *   RFC 8291 (aes128gcm) — encrypts the payload to keys only the subscriber's
 *                       browser holds. The push service relays it and cannot
 *                       read it, which is why message text may travel this way
 *                       at all.
 */
import { base64UrlToBytes, bytesToBase64Url, concatBytes } from './bytes.js'

const encoder = new TextEncoder()

/** Twelve hours: comfortably inside the 24 the spec allows, and cached per send. */
const VAPID_TTL_SECONDS = 12 * 60 * 60

/** How long a push service should hold an undelivered message. One school day. */
const PUSH_TTL_SECONDS = 12 * 60 * 60

/** The record size declared in the payload header. One record, so one is enough. */
const RECORD_SIZE = 4096

/**
 * The VAPID identity, as a single Worker secret:
 *
 *   { "publicKey": "<base64url, 65 bytes>",
 *     "privateKey": "<base64url, 32 bytes>",
 *     "subject": "mailto:support@scholastic.cloud" }
 *
 * Generate a pair with `node scripts/vapid-keys.mjs`. The pair is per service,
 * not per tenant — it identifies the sender to Google and Mozilla, and every
 * school here is the same sender.
 *
 * Absent, push is simply off: subscribing reports no key and nothing is ever
 * sent. That is the ordinary state of a deployment nobody has set it up on.
 */
export function vapidKeys(env) {
  if (!env.CHAT_VAPID) return null

  try {
    const keys = JSON.parse(env.CHAT_VAPID)
    if (!keys.publicKey || !keys.privateKey) return null

    return { subject: 'mailto:support@scholastic.cloud', ...keys }
  } catch {
    return null
  }
}

/* ===================== VAPID (RFC 8292) ===================== */

/**
 * Import the VAPID private key for signing.
 *
 * WebCrypto will not take a bare 32-byte scalar, so the pair is reassembled as a
 * JWK: `d` is the private key, and `x`/`y` are the two halves of the public
 * point after its leading 0x04 "uncompressed" tag.
 */
async function importSigningKey(keys) {
  const publicBytes = base64UrlToBytes(keys.publicKey)

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: bytesToBase64Url(publicBytes.subarray(1, 33)),
      y: bytesToBase64Url(publicBytes.subarray(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

/**
 * The `Authorization: vapid …` header for one push service.
 *
 * The audience is the push endpoint's origin and nothing more — a token minted
 * for Google's service is not accepted by Mozilla's, which is the point.
 */
async function vapidHeader(endpoint, keys) {
  const audience = new URL(endpoint).origin

  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + VAPID_TTL_SECONDS,
        sub: keys.subject,
      }),
    ),
  )

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importSigningKey(keys),
    encoder.encode(`${header}.${payload}`),
  )

  // WebCrypto hands back the raw r‖s pair ES256 wants, so there is no DER to
  // unpick here the way there would be with Node's signer.
  const token = `${header}.${payload}.${bytesToBase64Url(signature)}`

  return `vapid t=${token}, k=${keys.publicKey}`
}

/* ===================== payload encryption (RFC 8291) ===================== */

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])

  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  )

  return new Uint8Array(bits)
}

/**
 * Encrypt a payload to one subscription.
 *
 * The shape is fixed by the spec and worth reading as a whole: a fresh key pair
 * is generated per message, combined with the browser's public key into a shared
 * secret, and that secret is stretched — first with the subscription's `auth`
 * value, then with a random salt — into the content key and nonce. The sender's
 * public key travels in the header so the browser can do the same derivation
 * from its side.
 *
 * Nothing here is reused between messages, so intercepting one payload reveals
 * nothing about the next.
 */
async function encryptPayload(subscription, plaintext) {
  const uaPublicBytes = base64UrlToBytes(subscription.p256dh)
  const authSecret = base64UrlToBytes(subscription.auth)

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  const senderPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])

  const senderPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderPair.publicKey),
  )

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, senderPair.privateKey, 256),
  )

  // Bind the shared secret to both parties' public keys, so a secret derived for
  // one subscriber cannot be replayed at another.
  const keyInfo = concatBytes(
    encoder.encode('WebPush: info'),
    new Uint8Array([0]),
    uaPublicBytes,
    senderPublicBytes,
  )

  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))

  const contentKey = await hkdf(
    salt,
    ikm,
    concatBytes(encoder.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])),
    16,
  )

  const nonce = await hkdf(
    salt,
    ikm,
    concatBytes(encoder.encode('Content-Encoding: nonce'), new Uint8Array([0])),
    12,
  )

  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, [
    'encrypt',
  ])

  // 0x02 marks the last record. There is only ever one here — a chat preview is
  // far short of the 4096-byte record size declared below.
  const padded = concatBytes(encoder.encode(plaintext), new Uint8Array([2]))

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded),
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE)

  return concatBytes(
    salt,
    recordSize,
    new Uint8Array([senderPublicBytes.length]),
    senderPublicBytes,
    ciphertext,
  )
}

/* ===================== sending ===================== */

const hostOf = endpoint => {
  try {
    return new URL(endpoint).host
  } catch {
    return 'unknown'
  }
}

/**
 * Deliver one notification.
 *
 * Never throws: a push service being slow or a single dead subscription must not
 * affect the message that was already saved. `gone` is the one answer the caller
 * acts on — 404 and 410 mean the browser threw the subscription away, and the
 * row should follow it.
 */
export async function sendPush(subscription, payload, keys) {
  try {
    const body = await encryptPayload(subscription, payload)

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidHeader(subscription.endpoint, keys),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: 'normal',
      },
      body,
    })

    const gone = response.status === 404 || response.status === 410

    // A refusal that is not "this device is gone" is a configuration problem —
    // a VAPID key the push service will not accept, a malformed payload — and
    // it is otherwise completely silent, because nobody is waiting on this call.
    if (!response.ok && !gone) {
      console.error(
        `push to ${hostOf(subscription.endpoint)} refused: ${response.status} ${(
          await response.text().catch(() => '')
        ).slice(0, 200)}`,
      )
    }

    return { ok: response.ok, status: response.status, gone }
  } catch (error) {
    // The host, never the full endpoint: the path is a device identifier, and
    // knowing that Google's service is refusing everything is the whole reason
    // to look at this line.
    console.error(`push to ${hostOf(subscription.endpoint)} failed: ${error.message}`)
    return { ok: false, status: 0, gone: false }
  }
}
