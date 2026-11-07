BEGIN;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname text;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_identity') THEN
  ALTER TABLE users ADD CONSTRAINT users_identity CHECK (
   (email IS NOT NULL AND password IS NOT NULL AND nickname IS NULL) OR
   (email IS NULL AND password IS NULL AND nickname IS NOT NULL AND char_length(nickname) BETWEEN 1 AND 40 AND nickname=btrim(nickname) AND nickname !~ '[[:cntrl:]]')
  );
 END IF;
END $$;
CREATE OR REPLACE FUNCTION preserve_user_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Role is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER users_fixed_role BEFORE UPDATE OF role ON users FOR EACH ROW EXECUTE FUNCTION preserve_user_role();
COMMIT;
