CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password text NOT NULL,
 role text NOT NULL CHECK(role IN ('wife','husband')), adult boolean NOT NULL CHECK(adult), pair_id uuid
);
CREATE TABLE IF NOT EXISTS pairs (id uuid PRIMARY KEY, wife uuid UNIQUE NOT NULL REFERENCES users, husband uuid UNIQUE NOT NULL REFERENCES users, CHECK(wife<>husband));
CREATE TABLE IF NOT EXISTS auth_sessions (hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users, expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS invites (hash text PRIMARY KEY, owner uuid NOT NULL REFERENCES users, expires timestamptz NOT NULL, used boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS sessions (id uuid PRIMARY KEY, pair_id uuid NOT NULL REFERENCES pairs, status text NOT NULL, data jsonb NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_live_session ON sessions(pair_id) WHERE status NOT IN ('stopped','expired');
CREATE TABLE IF NOT EXISTS approvals (session_id uuid REFERENCES sessions, revision integer NOT NULL, user_id uuid REFERENCES users, PRIMARY KEY(session_id,revision,user_id));
CREATE TABLE IF NOT EXISTS awards (mission_id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions, points integer NOT NULL CHECK(points>=0));
CREATE TABLE IF NOT EXISTS request_keys (session_id uuid REFERENCES sessions, user_id uuid REFERENCES users, kind text NOT NULL, key uuid NOT NULL, result jsonb NOT NULL, PRIMARY KEY(session_id,user_id,kind,key));
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, period bigint NOT NULL, hits integer NOT NULL);
