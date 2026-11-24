-- Public mode private conversations. Additive only. Requests, answers, closes and messages take seq from room_events_seq, so SSE and polling order them with room events.
-- A conversation row's seq moves on every state change; a message row's seq moves on removal.
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  dom_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  sub_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  state text NOT NULL CHECK(state IN ('requested','accepted','declined','closed')),
  opening_body text NOT NULL CHECK(char_length(opening_body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  closed_at timestamptz,
  closed_by uuid,
  cooldown_until timestamptz,
  seq bigint NOT NULL DEFAULT nextval('room_events_seq') UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(dom_id<>sub_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_open_pair_idx ON conversations(dom_id, sub_id) WHERE state IN ('requested','accepted');
CREATE INDEX IF NOT EXISTS conversations_sub_idx ON conversations(sub_id);
CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
  idempotency_key uuid,
  seq bigint NOT NULL DEFAULT nextval('room_events_seq') UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_idempotency_idx ON conversation_messages(author_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversation_messages_conversation_idx ON conversation_messages(conversation_id, seq);
CREATE TABLE IF NOT EXISTS conversation_reports (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, reporter_id)
);
