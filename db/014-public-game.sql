BEGIN;
SELECT pg_advisory_xact_lock(hashtext('public-room'));

-- No private identities, singleton pairs or private-session foreign keys.
CREATE TABLE IF NOT EXISTS public_game_sessions (
  id uuid PRIMARY KEY REFERENCES public_play_sessions(request_id) ON DELETE CASCADE,
  data jsonb NOT NULL
);

-- Lifetime points earned by each public account. The legacy ledger remains
-- immutable; a migrated legacy mission already credited there is never copied.
CREATE TABLE IF NOT EXISTS public_game_awards (
  mission_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public_game_sessions(id),
  recipient_id uuid NOT NULL REFERENCES public_users(id),
  points integer NOT NULL CHECK(points BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_game_awards_recipient_idx ON public_game_awards(recipient_id);

CREATE TABLE IF NOT EXISTS public_game_tributes (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public_game_sessions(id) ON DELETE CASCADE,
  giver_id uuid NOT NULL REFERENCES public_users(id),
  receiver_id uuid NOT NULL REFERENCES public_users(id),
  kind text NOT NULL CHECK(kind IN ('note','voice','photo','service','greeting')),
  text text NOT NULL CHECK(length(text) BETWEEN 1 AND 4000),
  media text,
  delivered_at timestamptz,
  rated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_game_tributes_session_receiver_idx ON public_game_tributes(session_id,receiver_id);
COMMIT;
