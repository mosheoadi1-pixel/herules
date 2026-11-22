-- Public mode verification. Additive only. Media rows exist only until retention ends; decisions and audit rows are kept.
-- public_admin_audit has no foreign keys on purpose: audit rows must outlive the rows they describe.
CREATE TABLE IF NOT EXISTS public_consents (
  id uuid PRIMARY KEY,
  public_user_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  text_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text
);
CREATE INDEX IF NOT EXISTS public_consents_user_idx ON public_consents(public_user_id, kind, text_version);
CREATE TABLE IF NOT EXISTS public_verifications (
  id uuid PRIMARY KEY,
  public_user_id uuid NOT NULL REFERENCES public_users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK(method IN ('id_document','camera_age')),
  status text NOT NULL CHECK(status IN ('pending','passed','failed','review','purged')),
  reviewer_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  purge_after timestamptz
);
CREATE INDEX IF NOT EXISTS public_verifications_status_idx ON public_verifications(status);
CREATE INDEX IF NOT EXISTS public_verifications_purge_after_idx ON public_verifications(purge_after);
CREATE INDEX IF NOT EXISTS public_verifications_user_created_idx ON public_verifications(public_user_id, created_at);
CREATE TABLE IF NOT EXISTS public_verification_media (
  id uuid PRIMARY KEY,
  verification_id uuid NOT NULL REFERENCES public_verifications(id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public_admin_audit (
  id uuid PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target_verification_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
