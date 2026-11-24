BEGIN;
-- Coordinate backfill with approval, cancellation and blocks.
SELECT pg_advisory_xact_lock(hashtext('public-room'));

-- The invitation is the session identity. Membership is inherited from its
-- conversation, so a second session or a caller-selected pair is impossible.
CREATE TABLE IF NOT EXISTS public_play_sessions (
  request_id uuid PRIMARY KEY REFERENCES public_session_requests(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  stopped_at timestamptz
);
INSERT INTO public_play_sessions(request_id,opened_at)
SELECT id,updated_at FROM public_session_requests WHERE state='accepted'
ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS conversations_dom_history_idx ON conversations(dom_id);

CREATE TABLE IF NOT EXISTS public_play_missions (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public_play_sessions(request_id) ON DELETE CASCADE,
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 160),
  instructions text NOT NULL CHECK(char_length(instructions) BETWEEN 1 AND 4000),
  points integer NOT NULL CHECK(points BETWEEN 0 AND 100),
  state text NOT NULL DEFAULT 'assigned' CHECK(state IN ('assigned','accepted','submitted','returned','approved','declined')),
  version integer NOT NULL DEFAULT 0 CHECK(version>=0),
  return_reason text CHECK(char_length(return_reason) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_play_missions_session_idx ON public_play_missions(session_id,created_at DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS public_play_missions_current_idx ON public_play_missions(session_id)
  WHERE state NOT IN ('approved','declined');

-- Append only through the play API. No update, deletion, or spending path.
CREATE TABLE IF NOT EXISTS public_play_awards (
  mission_id uuid PRIMARY KEY REFERENCES public_play_missions(id),
  recipient_id uuid NOT NULL REFERENCES public_users(id),
  points integer NOT NULL CHECK(points BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_play_awards_recipient_idx ON public_play_awards(recipient_id);

CREATE TABLE IF NOT EXISTS public_play_request_keys (
  actor_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  key uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public_play_sessions(request_id) ON DELETE CASCADE,
  input jsonb NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(actor_id,key)
);
COMMIT;
