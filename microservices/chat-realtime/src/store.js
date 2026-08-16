/**
 * Every D1 query the chat service makes.
 *
 * D1 runs one query at a time per database, so the shapes here are chosen to
 * finish fast rather than to be tidy: unread is arithmetic on two integers, the
 * conversation list is a single join, and nothing counts rows it does not have
 * to.
 */
import { ulid } from './ulid.js'

const PAGE_SIZE = 50
const SYNC_LIMIT = 200

/** The poll cursor is a timestamp, and two writes can land either side of it. */
const SYNC_OVERLAP_MS = 2000

const nowIso = () => new Date().toISOString()

/* ===================== reads ===================== */

/**
 * Every group this person belongs to, with the unread count and a preview.
 *
 * One statement. The preview joins the message whose sequence equals the
 * conversation's current one — which is what `message_seq` buys beyond the
 * unread arithmetic.
 */
export async function listConversations(db, principal) {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.type, c.title, c.subtitle, c.academic_year, c.locked_at,
              c.message_seq, c.last_message_at,
              p.role, p.read_seq, p.removed_at,
              m.sender_name AS last_sender, m.body AS last_body,
              m.deleted_at AS last_deleted, m.created_at AS last_at
         FROM participants p
         JOIN conversations c ON c.id = p.conversation_id
         LEFT JOIN messages m ON m.conversation_id = c.id AND m.seq = c.message_seq
        WHERE p.participant_type = ?1 AND p.participant_id = ?2
        ORDER BY (p.removed_at IS NOT NULL) ASC,
                 c.last_message_at DESC,
                 c.title ASC`,
    )
    .bind(principal.participant_type, principal.participant_id)
    .all()

  return (results || []).map(serializeConversation)
}

export async function participantFor(db, conversationId, principal) {
  return db
    .prepare(
      `SELECT p.*, c.locked_at, c.message_seq, c.title AS conversation_title
         FROM participants p
         JOIN conversations c ON c.id = p.conversation_id
        WHERE p.conversation_id = ?1
          AND p.participant_type = ?2
          AND p.participant_id = ?3`,
    )
    .bind(conversationId, principal.participant_type, principal.participant_id)
    .first()
}

/** One page of transcript, newest first, handed back in reading order. */
export async function listMessages(db, conversationId, before) {
  const statement = before
    ? db
        .prepare(
          `SELECT * FROM messages
            WHERE conversation_id = ?1 AND created_at < ?2
            ORDER BY created_at DESC, id DESC LIMIT ?3`,
        )
        .bind(conversationId, before, PAGE_SIZE)
    : db
        .prepare(
          `SELECT * FROM messages
            WHERE conversation_id = ?1
            ORDER BY created_at DESC, id DESC LIMIT ?2`,
        )
        .bind(conversationId, PAGE_SIZE)

  const { results } = await statement.all()
  const rows = results || []

  return {
    messages: rows.slice().reverse().map(serializeMessage),
    has_more: rows.length === PAGE_SIZE,
  }
}

/**
 * Everything new across all of this person's groups.
 *
 * "New" means changed, not posted. A message a teacher removes an hour after it
 * was sent has to reach the people still looking at it, and a poll keyed on
 * created_at would never mention that message again — so the cursor runs against
 * `changed_at`, which is the posting time until something happens to the row.
 *
 * The cursor is reached back a couple of seconds because two writes committing
 * at once can land either side of a timestamp — the client dedupes by id, so
 * re-reading a small overlap is free and dropping a message is not.
 */
export async function sync(db, principal, since) {
  const summaries = await db
    .prepare(
      `SELECT c.id, c.last_message_at, c.locked_at,
              c.message_seq, p.read_seq, p.removed_at
         FROM participants p
         JOIN conversations c ON c.id = p.conversation_id
        WHERE p.participant_type = ?1 AND p.participant_id = ?2`,
    )
    .bind(principal.participant_type, principal.participant_id)
    .all()

  const conversations = (summaries.results || []).map(row => ({
    id: row.id,
    last_message_at: row.last_message_at,
    unread_count: unreadOf(row),
    locked: !!row.locked_at,
    can_post: !row.removed_at && !row.locked_at,
  }))

  let messages = []
  let carried = []
  let truncated = false

  if (since) {
    const from = new Date(new Date(since).getTime() - SYNC_OVERLAP_MS).toISOString()

    const { results } = await db
      .prepare(
        `SELECT m.* FROM messages m
           JOIN participants p ON p.conversation_id = m.conversation_id
          WHERE p.participant_type = ?1 AND p.participant_id = ?2
            AND m.changed_at > ?3
          ORDER BY m.changed_at ASC, m.id ASC
          LIMIT ?4`,
      )
      .bind(principal.participant_type, principal.participant_id, from, SYNC_LIMIT + 1)
      .all()

    const rows = results || []

    // More waiting than one poll should carry. Hand back a page and let the
    // client reload rather than growing this response without a bound.
    truncated = rows.length > SYNC_LIMIT
    carried = truncated ? rows.slice(0, SYNC_LIMIT) : rows
    messages = carried.map(serializeMessage)
  }

  return {
    messages,
    conversations,
    // On a truncated page resume from the last row actually handed over, not
    // from now — which would skip the remainder. Read from the row rather than
    // the serialized message: the cursor runs on changed_at, which the client
    // never sees.
    cursor: truncated ? carried[carried.length - 1].changed_at : nowIso(),
    truncated,
  }
}

/** Unread across every group, for the sidebar badge. Two integers per row. */
export async function unreadTotal(db, principal) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(MAX(c.message_seq - p.read_seq, 0)), 0) AS total
         FROM participants p
         JOIN conversations c ON c.id = p.conversation_id
        WHERE p.participant_type = ?1 AND p.participant_id = ?2`,
    )
    .bind(principal.participant_type, principal.participant_id)
    .first()

  return row?.total ?? 0
}

/** Everyone still in the group except the sender — the realtime recipient list. */
export async function recipientsExcept(db, conversationId, principal) {
  const { results } = await db
    .prepare(
      `SELECT participant_type AS type, participant_id AS id, muted_at
         FROM participants
        WHERE conversation_id = ?1
          AND removed_at IS NULL
          AND NOT (participant_type = ?2 AND participant_id = ?3)`,
    )
    .bind(conversationId, principal.participant_type, principal.participant_id)
    .all()

  return results || []
}

/* ===================== push subscriptions ===================== */

/**
 * Remember where to notify this person.
 *
 * REPLACE rather than a plain insert, and keyed on the endpoint: a browser hands
 * back the same endpoint every time until it decides to rotate it, and the row
 * has to follow whoever is signed in on that device now.
 */
export async function saveSubscription(db, principal, subscription) {
  await db
    .prepare(
      `INSERT INTO push_subscriptions
         (endpoint, participant_type, participant_id, p256dh, auth, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(endpoint) DO UPDATE SET
         participant_type = excluded.participant_type,
         participant_id   = excluded.participant_id,
         p256dh           = excluded.p256dh,
         auth             = excluded.auth`,
    )
    .bind(
      subscription.endpoint,
      principal.participant_type,
      principal.participant_id,
      subscription.p256dh,
      subscription.auth,
      nowIso(),
    )
    .run()
}

/** Forget one device, on the say-so of the person signed in on it. */
export async function forgetSubscription(db, principal, endpoint) {
  await db
    .prepare(
      `DELETE FROM push_subscriptions
        WHERE endpoint = ?1 AND participant_type = ?2 AND participant_id = ?3`,
    )
    .bind(endpoint, principal.participant_type, principal.participant_id)
    .run()
}

/** Forget devices the push service told us are gone. */
export async function forgetSubscriptions(db, endpoints) {
  if (!endpoints.length) return

  const placeholders = endpoints.map((_, i) => `?${i + 1}`).join(', ')

  await db
    .prepare(`DELETE FROM push_subscriptions WHERE endpoint IN (${placeholders})`)
    .bind(...endpoints)
    .run()
}

/** Every device belonging to any of these people. One query, however many. */
export async function subscriptionsFor(db, people) {
  if (!people.length) return []

  const keys = people.map(person => `${person.type}:${person.id}`)
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ')

  const { results } = await db
    .prepare(
      `SELECT endpoint, p256dh, auth
         FROM push_subscriptions
        WHERE (participant_type || ':' || participant_id) IN (${placeholders})`,
    )
    .bind(...keys)
    .all()

  return results || []
}

/* ===================== writes ===================== */

/**
 * Append a message and hand back the row.
 *
 * The sequence is claimed by the UPDATE rather than computed beforehand, so two
 * messages arriving together cannot be given the same number — SQLite
 * serializes the writes and each sees its own result.
 */
export async function insertMessage(db, conversationId, principal, body) {
  const createdAt = nowIso()

  const claimed = await db
    .prepare(
      `UPDATE conversations
          SET message_seq = message_seq + 1,
              last_message_at = ?1,
              updated_at = ?1
        WHERE id = ?2
        RETURNING message_seq`,
    )
    .bind(createdAt, conversationId)
    .first()

  if (!claimed) return null

  const message = {
    id: ulid(),
    conversation_id: conversationId,
    seq: claimed.message_seq,
    sender_type: principal.participant_type,
    sender_id: principal.participant_id,
    sender_name: principal.name || null,
    body,
    reply_to_id: null,
    edited_at: null,
    deleted_at: null,
    created_at: createdAt,
    changed_at: createdAt,
  }

  await db
    .prepare(
      `INSERT INTO messages
         (id, conversation_id, seq, sender_type, sender_id, sender_name, body,
          created_at, changed_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
    )
    .bind(
      message.id,
      conversationId,
      message.seq,
      message.sender_type,
      message.sender_id,
      message.sender_name,
      body,
      createdAt,
    )
    .run()

  // Sending is reading — otherwise the sender's own message sits in their badge.
  await db
    .prepare(
      `UPDATE participants
          SET read_seq = ?1, last_read_at = ?2
        WHERE conversation_id = ?3 AND participant_type = ?4 AND participant_id = ?5`,
    )
    .bind(
      message.seq,
      createdAt,
      conversationId,
      principal.participant_type,
      principal.participant_id,
    )
    .run()

  return message
}

/* ===================== moderation ===================== */

export async function messageIn(db, conversationId, messageId) {
  return db
    .prepare(`SELECT * FROM messages WHERE id = ?1 AND conversation_id = ?2`)
    .bind(messageId, conversationId)
    .first()
}

/**
 * Remove a message, leaving the tombstone.
 *
 * Never a hard delete. The row keeps its sequence number — unread counts are
 * arithmetic on that, so removing it would silently change everyone's badge —
 * and schools are asked for these transcripts, including for the messages that
 * had to be taken down.
 *
 * `changed_at` moves to now, which is what puts the removal in front of clients
 * that are polling rather than connected.
 */
export async function deleteMessage(db, conversationId, messageId, principal) {
  const now = nowIso()

  return db
    .prepare(
      `UPDATE messages
          SET deleted_at = ?1, deleted_by_type = ?2, deleted_by_id = ?3, changed_at = ?1
        WHERE id = ?4 AND conversation_id = ?5 AND deleted_at IS NULL
        RETURNING *`,
    )
    .bind(now, principal.participant_type, principal.participant_id, messageId, conversationId)
    .first()
}

/**
 * Close a group to new messages, or reopen it.
 *
 * Held here rather than in Laravel, and the roster push deliberately does not
 * carry it: membership comes from enrolment and belongs upstream, but who may
 * speak *right now* is a decision the teacher makes in this app, and a roster
 * push arriving a second later must not undo it.
 */
export async function setLocked(db, conversationId, locked) {
  const now = nowIso()

  await db
    .prepare(`UPDATE conversations SET locked_at = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(locked ? now : null, now, conversationId)
    .run()
}

export async function markRead(db, conversationId, principal) {
  await db
    .prepare(
      `UPDATE participants
          SET read_seq = (SELECT message_seq FROM conversations WHERE id = ?1),
              last_read_at = ?2
        WHERE conversation_id = ?1 AND participant_type = ?3 AND participant_id = ?4`,
    )
    .bind(conversationId, nowIso(), principal.participant_type, principal.participant_id)
    .run()
}

/**
 * Replace one group's roster with what Laravel just computed.
 *
 * Two rules make this safe to receive out of order and to receive twice:
 *
 *   - A push carrying a version at or below the stored one is ignored outright,
 *     so a delayed retry cannot resurrect an old roster.
 *   - Read positions are never touched. Someone who leaves and returns keeps
 *     their place; rebuilding the roster must not hand them 400 unread messages.
 *
 * `locked_at` is likewise left alone. A roster push says who is enrolled, which
 * Laravel knows; whether the teacher has closed the group to new messages is
 * decided here, and a push arriving a second later must not reopen it.
 */
export async function applyRoster(db, payload) {
  const conversation = payload.conversation
  const version = Number(conversation.version || 0)
  const now = nowIso()

  const existing = await db
    .prepare(`SELECT roster_version FROM conversations WHERE id = ?1`)
    .bind(conversation.id)
    .first()

  if (existing && Number(existing.roster_version) >= version) {
    return { applied: false, reason: 'stale' }
  }

  await db
    .prepare(
      `INSERT INTO conversations
         (id, institution_id, type, title, subtitle, academic_year,
          roster_version, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(id) DO UPDATE SET
         institution_id = excluded.institution_id,
         type           = excluded.type,
         title          = excluded.title,
         subtitle       = excluded.subtitle,
         academic_year  = excluded.academic_year,
         roster_version = excluded.roster_version,
         updated_at     = excluded.updated_at`,
    )
    .bind(
      conversation.id,
      conversation.institution_id,
      conversation.type,
      conversation.title,
      conversation.subtitle ?? null,
      conversation.academic_year ?? '',
      version,
      now,
    )
    .run()

  const participants = Array.isArray(payload.participants) ? payload.participants : []

  const statements = participants.map(person =>
    db
      .prepare(
        `INSERT INTO participants
           (conversation_id, participant_type, participant_id, role, removed_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(conversation_id, participant_type, participant_id) DO UPDATE SET
           role       = excluded.role,
           removed_at = excluded.removed_at`,
      )
      .bind(conversation.id, person.type, person.id, person.role, person.removed_at ?? null),
  )

  // Anyone the push did not mention has left. Marked, never deleted, so their
  // history and read position survive.
  const keys = participants.map(p => `${p.type}:${p.id}`)
  const placeholders = keys.map((_, i) => `?${i + 3}`).join(', ')

  statements.push(
    db
      .prepare(
        `UPDATE participants
            SET removed_at = ?2
          WHERE conversation_id = ?1
            AND removed_at IS NULL
            ${keys.length ? `AND (participant_type || ':' || participant_id) NOT IN (${placeholders})` : ''}`,
      )
      .bind(conversation.id, now, ...keys),
  )

  if (statements.length) await db.batch(statements)

  return { applied: true, participants: participants.length }
}

/* ===================== serialization ===================== */

const unreadOf = row => Math.max(Number(row.message_seq) - Number(row.read_seq), 0)

function serializeConversation(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    academic_year: row.academic_year,
    last_message_at: row.last_message_at,
    locked: !!row.locked_at,
    unread_count: unreadOf(row),
    role: row.role,
    can_post: !row.removed_at && !row.locked_at,
    archived: !!row.removed_at,
    last_message: row.last_at
      ? {
          sender_name: row.last_sender,
          preview: row.last_deleted
            ? 'Message removed'
            : String(row.last_body || '').slice(0, 80),
          created_at: row.last_at,
        }
      : null,
  }
}

export function serializeMessage(row) {
  const deleted = !!row.deleted_at

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_type: row.sender_type,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    // A removed message keeps its place in the transcript but never its text.
    body: deleted ? null : row.body,
    is_deleted: deleted,
    reply_to_id: row.reply_to_id ?? null,
    edited_at: row.edited_at ?? null,
    created_at: row.created_at,
  }
}
