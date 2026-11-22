-- Public mode accounts. Additive only; the private tables (users, auth_sessions) are untouched.
-- Role and gender are fixed at registration in this phase. nickname_key is the lowercased, trimmed nickname.
CREATE TABLE IF NOT EXISTS public_users (
  id uuid PRIMARY KEY,
  nickname text NOT NULL,
  nickname_key text NOT NULL UNIQUE,
  role text NOT NULL CHECK(role IN ('sub','dom')),
  gender text NOT NULL CHECK(gender IN ('woman','man','non_binary','other')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_identities (
  provider text NOT NULL CHECK(provider IN ('google','apple')),
  provider_subject text NOT NULL,
  public_user_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  PRIMARY KEY(provider, provider_subject)
);
CREATE TABLE IF NOT EXISTS public_sessions (hash text PRIMARY KEY, public_user_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE, expires timestamptz NOT NULL);
-- One-use sign-in rows. A row is an OAuth state (pending_subject NULL, before the callback) or a pending registration (pending_subject set, after the callback).
CREATE TABLE IF NOT EXISTS public_auth_states (
  token text PRIMARY KEY,
  provider text NOT NULL CHECK(provider IN ('google','apple')),
  code_verifier text NOT NULL,
  pending_subject text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_auth_states_expires_at_idx ON public_auth_states(expires_at);
