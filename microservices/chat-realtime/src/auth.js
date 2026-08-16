/**
 * Tenant configuration and token verification.
 *
 * Nothing here calls back to Laravel. A token is verified against the tenant's
 * own secret at the edge, which is what keeps the API off the hot path — and
 * what makes this work at all for a deployment behind a firewall the Worker
 * cannot reach.
 */
import { base64UrlToBytes } from './bytes.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Tenants as a single JSON Worker secret:
 *
 *   { "prod": { "secret": "…", "api": "https://…/api", "db": "CHAT_DB_PROD" } }
 *
 * Per-tenant secrets rather than one shared key, so a compromised deployment
 * cannot mint tokens naming a different school.
 */
export function tenants(env) {
  try {
    return JSON.parse(env.CHAT_TENANTS || '{}')
  } catch {
    return {}
  }
}

export function tenantConfig(env, id) {
  return tenants(env)[id] || null
}

/**
 * The D1 binding for a tenant. Each school gets its own database: D1 executes
 * one query at a time, so a shared database would serialize every school behind
 * every other one.
 */
export function tenantDb(env, tenantId) {
  const config = tenantConfig(env, tenantId)
  if (!config) return null

  return env[config.db || 'CHAT_DB'] || null
}

/** Length-independent comparison, so a wrong secret cannot be found by timing. */
export function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * Verify an HS256 token minted by the API.
 *
 * The tenant is read from the unverified payload only to choose which secret to
 * check the signature against — the same job a `kid` header does. Nothing in the
 * token is trusted until the signature passes.
 *
 * The claims prove *identity only*. What this person may see is decided by the
 * roster on every request, so a student removed from a section loses access
 * immediately rather than when their token runs out.
 */
export async function verifyToken(token, env) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null

  const [header, payload, signature] = parts

  let claims
  try {
    claims = JSON.parse(decoder.decode(base64UrlToBytes(payload)))
  } catch {
    return null
  }

  const tenant = tenantConfig(env, claims.tenant)
  if (!tenant?.secret) return null

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(tenant.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(signature),
    encoder.encode(`${header}.${payload}`),
  )
  if (!valid) return null

  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null
  if (!claims.participant_type || !claims.participant_id) return null

  return claims
}

/** Bearer auth for the server-to-server routes Laravel calls. */
export function authorizeTenantCall(request, env) {
  const id = request.headers.get('X-Chat-Tenant')
  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const tenant = tenantConfig(env, id)

  if (!tenant || !secretsMatch(bearer, tenant.secret)) return null

  return { id, tenant }
}
