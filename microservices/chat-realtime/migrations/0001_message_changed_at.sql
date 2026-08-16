-- Adds messages.changed_at, for a database created before moderation existed.
--
-- `schema.sql` is all CREATE TABLE IF NOT EXISTS, which is enough for a new
-- column on a *new* database and does nothing at all to an existing one. Adding
-- a column to a live tenant needs this:
--
--   npx wrangler d1 execute scholastic-chat-<tenant> --remote \
--     --file migrations/0001_message_changed_at.sql
--
-- Safe to run twice? No — SQLite has no ADD COLUMN IF NOT EXISTS, and the second
-- run errors on the duplicate. That error is the whole check; nothing is
-- half-applied by it.

ALTER TABLE messages ADD COLUMN changed_at TEXT;

-- Everything that already exists last changed when it was posted.
UPDATE messages SET changed_at = created_at WHERE changed_at IS NULL;

CREATE INDEX IF NOT EXISTS messages_changed ON messages (changed_at);

DROP INDEX IF EXISTS messages_time;
