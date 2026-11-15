CREATE TABLE IF NOT EXISTS tributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  giver_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- Comment: Tributes flow from husband to wife. Each tribute is an optional, idempotent devotion note/worship act. Reveal is always wife-initiated.