-- All verified members have implicit access to the operator-curated catalog.
CREATE TABLE IF NOT EXISTS public_rooms (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('group','channel')),
  title_he text NOT NULL,
  title_en text NOT NULL,
  position int NOT NULL
);
INSERT INTO public_rooms(id,kind,title_he,title_en,position) VALUES
  ('main','group','החדר הראשי','Main room',0),
  ('introductions','group','היכרות','Introductions',10),
  ('community','channel','ערוץ קהילה','Community channel',20)
ON CONFLICT(id) DO NOTHING;

-- The constant default also assigns old rows to Main without rewriting their
-- IDs, event sequence, report references, or removal markers.
ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS room_id text NOT NULL DEFAULT 'main' REFERENCES public_rooms(id);
CREATE INDEX IF NOT EXISTS room_messages_room_seq_idx ON room_messages(room_id,seq DESC);
CREATE TABLE IF NOT EXISTS public_room_grants (
  room_id text NOT NULL REFERENCES public_rooms(id),
  sub_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  grantor_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  grantor_verified_at timestamptz NOT NULL,
  PRIMARY KEY(room_id,sub_id,grantor_id),
  CHECK(sub_id<>grantor_id)
);
CREATE INDEX IF NOT EXISTS public_room_grants_pair_idx ON public_room_grants(grantor_id,sub_id);

-- Coalesce refresh signals per viewer. These carry no room, nickname or grant
-- data and only the affected user's stream can see them.
CREATE TABLE IF NOT EXISTS public_messaging_refresh (
  viewer_id uuid PRIMARY KEY REFERENCES public_users(id) ON DELETE CASCADE,
  seq bigint NOT NULL UNIQUE DEFAULT nextval('room_events_seq')
);
