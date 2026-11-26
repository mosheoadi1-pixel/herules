-- Keep new uploads in PostgreSQL; retain paths for images from older deployments.
ALTER TABLE public_verification_media
  ALTER COLUMN storage_path DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS image_index smallint CHECK(image_index BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS content_type text CHECK(content_type IN ('image/jpeg','image/png')),
  ADD COLUMN IF NOT EXISTS image_bytes bytea CHECK(octet_length(image_bytes) BETWEEN 1 AND 5242880);

ALTER TABLE public_verification_media
  DROP CONSTRAINT IF EXISTS public_verification_media_source_check,
  ADD CONSTRAINT public_verification_media_source_check CHECK(
    (storage_path IS NULL AND image_index IS NOT NULL AND content_type IS NOT NULL AND image_bytes IS NOT NULL)
    OR (storage_path IS NOT NULL AND image_index IS NULL AND content_type IS NULL AND image_bytes IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS public_verification_media_index_idx ON public_verification_media(verification_id,image_index);
