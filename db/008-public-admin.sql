-- Public mode admin gate. Additive only. Stores a SHA-256 hex of the lowercased, trimmed Google email, never the email.
ALTER TABLE public_users ADD COLUMN IF NOT EXISTS email_sha256 text;
ALTER TABLE public_users DROP CONSTRAINT IF EXISTS public_users_email_sha256_format;
ALTER TABLE public_users ADD CONSTRAINT public_users_email_sha256_format CHECK(email_sha256 IS NULL OR email_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public_auth_states ADD COLUMN IF NOT EXISTS pending_email_sha256 text;
ALTER TABLE public_auth_states DROP CONSTRAINT IF EXISTS public_auth_states_pending_email_sha256_format;
ALTER TABLE public_auth_states ADD CONSTRAINT public_auth_states_pending_email_sha256_format CHECK(pending_email_sha256 IS NULL OR pending_email_sha256 ~ '^[0-9a-f]{64}$');
