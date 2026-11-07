BEGIN;
SELECT pg_advisory_xact_lock(731903);
CREATE TABLE IF NOT EXISTS private_game (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 wife uuid UNIQUE REFERENCES users,
 husband uuid UNIQUE REFERENCES users,
 pair_id uuid UNIQUE REFERENCES pairs,
 CHECK(wife IS NULL OR husband IS NULL OR wife<>husband),
 CHECK((pair_id IS NULL) = (wife IS NULL OR husband IS NULL))
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private_game) THEN
  IF (SELECT count(*) FROM pairs)>1 THEN
   RAISE EXCEPTION 'Multiple existing pairs: select the private game with the documented migration procedure before restarting';
  END IF;
  INSERT INTO private_game(singleton,wife,husband,pair_id) SELECT true,wife,husband,id FROM pairs;
  INSERT INTO private_game(singleton) VALUES(true) ON CONFLICT DO NOTHING;
 END IF;
END $$;
COMMIT;
