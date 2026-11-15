-- Tributes flow from husband to wife. Each tribute is an optional, idempotent
-- devotion (note, voice, photo, service or greeting). Reveal is always
-- wife-initiated, and nothing is ever sent to her automatically.
CREATE TABLE IF NOT EXISTS tributes (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  giver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('note','voice','photo','service','greeting')),
  text text NOT NULL CHECK(length(text) BETWEEN 1 AND 4000),
  media text,
  delivered_at timestamptz,
  rated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS tributes_session_id_idx ON tributes(session_id);
CREATE INDEX IF NOT EXISTS tributes_receiver_id_idx ON tributes(receiver_id);
CREATE INDEX IF NOT EXISTS tributes_delivered_at_idx ON tributes(delivered_at);
