-- Public mode general room. Additive only. A removed message keeps its row for audit; readers only ever see the removed marker.
-- seq comes from one shared sequence: it is the SSE event id and the polling cursor. Removal takes a new seq so the change is an event too.
CREATE SEQUENCE IF NOT EXISTS room_events_seq;
CREATE TABLE IF NOT EXISTS room_messages (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public_users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
  idempotency_key uuid,
  seq bigint NOT NULL DEFAULT nextval('room_events_seq') UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS room_messages_idempotency_idx ON room_messages(author_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS room_messages_created_idx ON room_messages(created_at);
CREATE TABLE IF NOT EXISTS room_reports (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES room_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, reporter_id)
);
CREATE TABLE IF NOT EXISTS room_blocks (
  blocker_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(blocker_id, blocked_id),
  CHECK(blocker_id<>blocked_id)
);
CREATE INDEX IF NOT EXISTS room_blocks_blocked_idx ON room_blocks(blocked_id, blocker_id);
-- Audit rows stay without foreign keys; a removal audit names the message it describes.
ALTER TABLE public_admin_audit ADD COLUMN IF NOT EXISTS target_message_id uuid;
