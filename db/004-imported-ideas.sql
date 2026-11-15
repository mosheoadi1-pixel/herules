CREATE TABLE IF NOT EXISTS imported_ideas (
 id text PRIMARY KEY,
 category text NOT NULL CHECK(category IN ('challenges','timed','rewards','consequences','roleplay','anticipation','random','secret')),
 he text NOT NULL CHECK(length(he) BETWEEN 1 AND 4000),
 en text NOT NULL CHECK(length(en) BETWEEN 1 AND 4000),
 minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 525600),
 intensity integer NOT NULL CHECK(intensity BETWEEN 1 AND 3),
 tags text[] NOT NULL
);
-- Upgrade existing installations as well as newly created tables.
ALTER TABLE imported_ideas
 DROP CONSTRAINT IF EXISTS imported_ideas_category_check,
 ADD CONSTRAINT imported_ideas_category_check CHECK(category IN ('challenges','timed','rewards','consequences','roleplay','anticipation','random','secret','teasing','cleaning','cooking'));
