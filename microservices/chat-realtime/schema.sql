-- D1 schema for the chat service. One database per tenant.
--
-- Two things here differ from the MySQL tables this replaces, and both are
-- forced by D1 processing one query at a time per database:
--
--   1. `message_seq` / `read_seq`. Unread is the difference between two integers
--      rather than a count over messages. The MySQL version scanned messages
--      across every group a person was in, which on a single-threaded database
--      would queue behind itself.
--   2. Rosters are a projection pushed from Laravel, carrying `roster_version`
--      so a delayed push can never overwrite a newer one.

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  institution_id  TEXT NOT NULL,
  type            TEXT NOT NULL,              -- advisory | subject
  title           TEXT NOT NULL,
  subtitle        TEXT,
  academic_year   TEXT NOT NULL DEFAULT '',
  locked_at       TEXT,
  -- The number given to the most recent message. Never decreases.
  message_seq     INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  -- Laravel's roster generation. Pushes older than this are ignored.
  roster_version  INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conversations_recent
  ON conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS participants (
  conversation_id  TEXT NOT NULL,
  -- Staff and students are separate tables upstream with separate id spaces,
  -- so the type has to travel with the id.
  participant_type TEXT NOT NULL,             -- user | student
  participant_id   TEXT NOT NULL,
  role             TEXT NOT NULL,             -- teacher | student
  read_seq         INTEGER NOT NULL DEFAULT 0,
  last_read_at     TEXT,
  muted_at         TEXT,
  -- Set when someone leaves the section or subject: history stays readable,
  -- the composer closes.
  removed_at       TEXT,
  PRIMARY KEY (conversation_id, participant_type, participant_id)
);

-- "every group this person is in" — the first query of every request.
CREATE INDEX IF NOT EXISTS participants_person
  ON participants (participant_type, participant_id);

CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,          -- ULID: sorts by the time it was minted
  conversation_id  TEXT NOT NULL,
  seq              INTEGER NOT NULL,          -- position within this conversation
  sender_type      TEXT NOT NULL,             -- user | student | system
  sender_id        TEXT,
  sender_name      TEXT,
  body             TEXT NOT NULL,
  reply_to_id      TEXT,
  edited_at        TEXT,
  -- Never a hard delete. A removed message keeps its place as a tombstone.
  deleted_at       TEXT,
  deleted_by_type  TEXT,
  deleted_by_id    TEXT,
  created_at       TEXT NOT NULL,
  -- When this row last changed, which is when it was posted until a teacher
  -- removes it. The sync poll reads *this*, not created_at: a message removed an
  -- hour after it was sent has to reach the people still looking at it, and
  -- polling on created_at would never mention it again.
  changed_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_conversation
  ON messages (conversation_id, seq);

-- Serves the sync poll: everything changed after a cursor, across many groups.
CREATE INDEX IF NOT EXISTS messages_changed
  ON messages (changed_at);

-- Where to send a notification when someone's tab is shut.
--
-- Keyed on the endpoint, not on the person: a browser mints one endpoint per
-- device per profile, so a student with a phone and a school tablet has two —
-- and a shared tablet whose next user signs in re-registers the same endpoint
-- under the new name, which the primary key handles by replacing the row rather
-- than leaving the message going to whoever sat there before.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint         TEXT PRIMARY KEY,
  participant_type TEXT NOT NULL,             -- user | student
  participant_id   TEXT NOT NULL,
  -- The browser's public key and auth secret. The payload is encrypted to these,
  -- so the push service in the middle relays text it cannot read.
  p256dh           TEXT NOT NULL,
  auth             TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  last_used_at     TEXT
);

CREATE INDEX IF NOT EXISTS push_person
  ON push_subscriptions (participant_type, participant_id);
