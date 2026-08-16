/**
 * Generate the VAPID identity the push sender needs. Run once, ever:
 *
 *   node scripts/vapid-keys.mjs
 *
 * Then store the whole object as a Worker secret:
 *
 *   npx wrangler secret put CHAT_VAPID
 *
 * Keep the pair. Replacing it invalidates every subscription every browser
 * currently holds — each one is bound to the public key it was created with, so
 * a new pair means silence until every device subscribes again.
 *
 * Node's own WebCrypto, so there is nothing to install.
 */
import { webcrypto as crypto } from 'node:crypto'

const base64Url = bytes =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])

const publicKey = base64Url(await crypto.subtle.exportKey('raw', pair.publicKey))
const { d: privateKey } = await crypto.subtle.exportKey('jwk', pair.privateKey)

// `subject` is a contact address, not a secret — a push service uses it to reach
// a human when this sender starts misbehaving.
console.log(
  JSON.stringify(
    { publicKey, privateKey, subject: 'mailto:support@scholastic.cloud' },
    null,
    2,
  ),
)
