CREATE TABLE IF NOT EXISTS public_session_requests (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  proposer_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),
  details text NOT NULL CHECK(char_length(details) BETWEEN 1 AND 1000),
  starts_at timestamptz NOT NULL,
  counter_starts_at timestamptz,
  state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','countered','accepted','declined','withdrawn','cancelled')),
  idempotency_key uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS public_session_requests_open_idx ON public_session_requests(conversation_id) WHERE state IN ('requested','countered');
CREATE UNIQUE INDEX IF NOT EXISTS public_session_requests_key_idx ON public_session_requests(proposer_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS public_session_requests_conversation_idx ON public_session_requests(conversation_id,created_at DESC,id);

-- Append-only transitions keep resume stable even if the request changes again before a reader catches up.
-- The same rows provide the per-user action budget without counting a retry twice.
CREATE TABLE IF NOT EXISTS public_session_events (
  seq bigint PRIMARY KEY DEFAULT nextval('room_events_seq'),
  request_id uuid NOT NULL REFERENCES public_session_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  state text NOT NULL CHECK(state IN ('requested','countered','accepted','declined','withdrawn','cancelled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_session_events_actor_idx ON public_session_events(actor_id,created_at);
CREATE INDEX IF NOT EXISTS public_session_events_request_idx ON public_session_events(request_id);
